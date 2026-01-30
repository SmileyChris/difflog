import Alpine from 'alpinejs';

declare const Stripe: any;

interface StripeElements {
  create(type: string): any;
}

interface StripeInstance {
  elements(options: any): StripeElements;
  confirmPayment(options: any): Promise<{ error?: { message: string }; paymentIntent?: { status: string } }>;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

Alpine.data('credsCheckout', () => ({
  showModal: false,
  loading: false,
  ready: false,
  error: null as string | null,
  successMessage: '',
  email: '',
  selectedPack: null as string | null,
  stripe: null as StripeInstance | null,
  elements: null as StripeElements | null,
  paymentElement: null as any,
  transactions: [] as Transaction[],
  loadingHistory: false,
  historyFilter: 'topups' as 'topups' | 'usage',

  get packLabel() {
    if (this.selectedPack === 'starter') return 'Starter Pack - 10 Creds';
    if (this.selectedPack === 'value') return 'Best Value - 50 Creds';
    return '';
  },

  get packPrice() {
    if (this.selectedPack === 'starter') return '$2';
    if (this.selectedPack === 'value') return '$7';
    return '';
  },

  async startCheckout(pack: string) {
    this.selectedPack = pack;
    this.error = null;
    this.successMessage = '';
    this.ready = false;
    this.showModal = true;

    const store = (this as any).$store.app;

    // Use logged-in email if available
    if (store.isLoggedIn) {
      this.email = store.userEmail;
    }

    // Get Stripe publishable key from data attribute
    const pkElement = document.querySelector('[data-stripe-pk]');
    const stripePk = pkElement?.getAttribute('data-stripe-pk') || '';

    if (!stripePk || stripePk === 'pk_test_xxx') {
      this.error = 'Stripe not configured. Add your publishable key to data-stripe-pk.';
      return;
    }

    // Initialize Stripe if not already done
    if (!this.stripe) {
      if (typeof Stripe === 'undefined') {
        this.error = 'Stripe.js not loaded';
        return;
      }
      this.stripe = Stripe(stripePk);
    }

    // Create PaymentIntent
    this.loading = true;
    try {
      const res = await fetch('/api/purchase/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack: pack,
          email: this.email || 'pending@example.com'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create payment');
      }

      // Create Elements
      this.elements = this.stripe!.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#00d4aa',
            colorBackground: '#1a1a2e',
            colorText: '#e0e0e0',
            colorDanger: '#ff6b6b',
            fontFamily: 'system-ui, sans-serif',
            borderRadius: '8px',
          }
        }
      });

      // Mount Payment Element
      this.paymentElement = this.elements.create('payment');
      this.paymentElement.mount('#payment-element');

      this.paymentElement.on('ready', () => {
        this.ready = true;
      });

    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },

  async submitPayment() {
    if (!this.stripe || !this.elements) return;

    const store = (this as any).$store.app;

    // Validate email
    if (!store.isLoggedIn && !this.email) {
      this.error = 'Please enter your email';
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const { error, paymentIntent } = await this.stripe.confirmPayment({
        elements: this.elements,
        confirmParams: {
          receipt_email: this.email || store.userEmail,
          return_url: window.location.origin + '/creds?success=1',
        },
        redirect: 'if_required'
      });

      if (error) {
        this.error = error.message;
      } else if (paymentIntent?.status === 'succeeded') {
        this.showModal = false;
        const creds = this.selectedPack === 'starter' ? 10 : 50;
        this.successMessage = `+${creds} creds added`;

        // Update local state (optimistic - webhook will confirm in DB)
        store.addCredits(creds);

        // Poll for webhook to process and update history
        await this.pollForTransaction();
      }
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },

  closeModal() {
    this.showModal = false;
    if (this.paymentElement) {
      this.paymentElement.destroy();
      this.paymentElement = null;
    }
    this.elements = null;
  },

  async pollForTransaction() {
    // Remember the newest transaction ID before polling
    const previousNewestId = this.transactions[0]?.id;
    this.loadingHistory = true;

    try {
      // Poll up to 10 times, 1 second apart
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        await this.fetchHistory(true, true); // Don't sync balance, don't touch loading state

        // Check if a NEW purchase transaction appeared
        const newest = this.transactions[0];
        if (newest && newest.id !== previousNewestId && newest.type === 'purchase') {
          // New transaction confirmed - sync balance from server
          await this.fetchHistory(false, true);
          return;
        }
      }

      // Gave up polling, do a final sync anyway
      await this.fetchHistory(false, true);
    } finally {
      this.loadingHistory = false;
    }
  },

  async fetchHistory(skipBalanceSync = false, skipLoadingState = false) {
    const store = (this as any).$store.app;
    if (!store.isLoggedIn) return;

    if (!skipLoadingState) this.loadingHistory = true;
    try {
      const res = await fetch(`/api/creds/history?email=${encodeURIComponent(store.user.email)}&code=${encodeURIComponent(store.user.code)}&filter=${this.historyFilter}`);
      if (res.ok) {
        const data = await res.json();
        this.transactions = data.transactions || [];
        // Sync balance from server (unless skipped after purchase)
        if (!skipBalanceSync && typeof data.creds === 'number') {
          store.user = { ...store.user, creds: data.creds };
        }
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      if (!skipLoadingState) this.loadingHistory = false;
    }
  },

  async setFilter(filter: 'topups' | 'usage') {
    this.historyFilter = filter;
    await this.fetchHistory();
  },

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  init() {
    // Check for success redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
      this.successMessage = 'Creds added successfully';
      // Clean up URL
      window.history.replaceState({}, '', '/creds');
    }

    // Fetch purchase history
    this.fetchHistory();
  }
}));
