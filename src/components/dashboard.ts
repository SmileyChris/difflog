import Alpine from 'alpinejs';
import { SCAN_MESSAGES, DEPTHS } from '../lib/constants';
import { timeAgo, daysSince, getCurrentDateFormatted } from '../lib/time';
import { buildPrompt } from '../lib/prompt';
import { starId } from '../lib/sync';
import { getUnmappedItems, resolveSourcesForItem, curateGeneralFeeds, searchWebForProfile, formatItemsForPrompt, formatWebSearchForPrompt, type FeedItem } from '../lib/feeds';

Alpine.data('dashboard', () => ({
  generating: false,
  showProfile: false,
  showPrompt: false,
  promptText: '',
  ctrlHeld: false,
  error: null as string | null,
  diff: null as any,
  scanIndex: 0,
  selectedDepth: 'standard',
  scanMessages: SCAN_MESSAGES,
  scanInterval: null as ReturnType<typeof setInterval> | null,
  currentDate: getCurrentDateFormatted(),
  // Sync banner state
  syncBannerDismissed: false,

  init() {
    if (!(this as any).$store.app.isUnlocked) {
      const ids = Object.keys((this as any).$store.app.profiles);
      if (ids.length > 0) {
        window.location.href = '/profiles';
      } else {
        window.location.href = '/about';
      }
      return;
    }

    window.addEventListener('keydown', (e) => { if (e.key === 'Control') this.ctrlHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') this.ctrlHeld = false; });
    window.addEventListener('blur', () => { this.ctrlHeld = false; });

    const viewId = sessionStorage.getItem('viewDiffId');
    const scrollToPIndex = sessionStorage.getItem('scrollToPIndex');
    if (viewId) {
      sessionStorage.removeItem('viewDiffId');
      sessionStorage.removeItem('scrollToPIndex');
      const diff = (this as any).$store.app.history.find((d: any) => d.id === viewId);
      if (diff) {
        this.diff = diff;
        if (scrollToPIndex !== null) {
          this.scrollToAndHighlight(parseInt(scrollToPIndex, 10));
        }
        return;
      }
    }

    // Only load latest if we don't already have a diff set (prevents double-init overwrite)
    if (!this.diff) {
      this.loadLatestDiff();
    }
  },

  loadLatestDiff() {
    this.diff = null;
    this.selectedDepth = (this as any).$store.app.profile?.depth || 'standard';
    const history = (this as any).$store.app.history;
    if (history.length > 0) {
      const mostRecent = history[0];
      const generatedTime = new Date(mostRecent.generated_at).getTime();
      const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000);
      if (generatedTime > fiveDaysAgo) {
        this.diff = mostRecent;
      }
    }
  },

  trackingText() {
    const p = (this as any).$store.app.profile;
    if (!p) return '';
    return [...(p.languages || []), ...(p.frameworks || []), ...(p.tools || [])].join(' \u00b7 ');
  },

  depthLabel() {
    const p = (this as any).$store.app.profile;
    if (!p) return '';
    const d = DEPTHS.find(d => d.id === p.depth);
    return d ? d.label : 'Standard Brief';
  },

  showLastDiff() {
    const history = (this as any).$store.app.history;
    if (history.length > 0) this.diff = history[0];
  },

  prevDiff() {
    const history = (this as any).$store.app.history;
    const idx = history.findIndex((d: any) => d.id === this.diff?.id);
    return idx >= 0 && idx < history.length - 1 ? history[idx + 1] : null;
  },

  nextDiff() {
    const history = (this as any).$store.app.history;
    const idx = history.findIndex((d: any) => d.id === this.diff?.id);
    return idx > 0 ? history[idx - 1] : null;
  },

  diffPosition(): string {
    const history = (this as any).$store.app.history;
    if (!this.diff || history.length === 0) return '';
    const idx = history.findIndex((d: any) => d.id === this.diff?.id);
    if (idx < 0) return '';
    return `${idx + 1} of ${history.length}`;
  },

  timeAgo(dateStr: string): string {
    return timeAgo(dateStr);
  },

  isTodayDiff(): boolean {
    const history = (this as any).$store.app.history;
    if (history.length === 0) return false;
    return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
  },

  get lastDiffDays(): number {
    const history = (this as any).$store.app.history;
    return history.length > 0 ? daysSince(history[0].generated_at) : Infinity;
  },

  welcomeHeading(): string {
    const name = (this as any).$store.app.profile?.name || 'Developer';
    const history = (this as any).$store.app.history;

    if (this.diff && history.length > 0 && this.diff.id !== history[0].id) {
      return `From the archives, ${name}`;
    }

    if (history.length === 0) return `Welcome, ${name}`;

    const days = this.lastDiffDays;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

    if (days <= 1) return `Good ${timeGreeting}, ${name}`;
    if (days <= 3) return `Hey again, ${name}`;
    if (days <= 7) return `Welcome back, ${name}`;
    if (days <= 14) return `Missed you, ${name}`;
    return `Long time no see, ${name}`;
  },

  welcomeText(): string {
    const history = (this as any).$store.app.history;
    if (history.length === 0) return "A diff is your personalized changelog for the developer ecosystem — releases, announcements, and developments filtered to what you care about.<br><br>Hit the button to generate your first one.";

    if (this.isTodayDiff()) return 'Your diff is current. Regenerate to get the latest <small>(or hold <kbd>Ctrl</kbd> to generate another)</small>';
    const days = this.lastDiffDays;
    if (days <= 1) return 'A lot can change overnight. Ready to catch you up.';
    if (days <= 3) return "A few days of updates are waiting for you.";
    if (days <= 7) return "The dev world moves fast — time to catch up.";
    if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
    return "You've got weeks of ecosystem changes to unpack.";
  },

  getLastDiffDate(): string | undefined {
    const history = (this as any).$store.app.history;
    return history.length > 0 ? history[0].generated_at : undefined;
  },

  estimatedTime() {
    const history = (this as any).$store.app.history;
    const durations = history.map((h: any) => h.duration_seconds).filter((d: any) => d > 0);
    if (durations.length === 0) return 'This usually takes 30\u201360 seconds...';
    const avg = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length);
    if (avg < 60) return `Usually takes about ${avg} seconds...`;
    const mins = Math.floor(avg / 60);
    const secs = avg % 60;
    return secs > 0 ? `Usually takes about ${mins}m ${secs}s...` : `Usually takes about ${mins} minute${mins > 1 ? 's' : ''}...`;
  },

  async previewPrompt() {
    this.promptText = 'Loading prompt...';
    this.showPrompt = true;

    try {
      const profile = (this as any).$store.app.profile;
      const lastDiff = (this as any).$store.app.history[0];

      let feedContext = '';
      try {
        const feedRes = await fetch('/api/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languages: profile.languages || [],
            frameworks: profile.frameworks || [],
            tools: profile.tools || [],
            topics: profile.topics || [],
            resolvedMappings: profile.resolvedMappings || {},
          }),
        });
        if (feedRes.ok) {
          const feedData = await feedRes.json();
          const feeds = feedData.feeds || {};

          // For preview, show all items without curation
          const allItems: FeedItem[] = [
            ...(feeds.hn || []),
            ...(feeds.lobsters || []),
            ...(feeds.reddit || []),
            ...(feeds.github || []),
            ...(feeds.devto || []),
          ];

          feedContext = formatItemsForPrompt(allItems);
        }
      } catch {
        feedContext = '[Feed fetch failed]';
      }

      const prompt = buildPrompt(
        { ...profile, depth: this.selectedDepth },
        feedContext,
        this.getLastDiffDate(),
        lastDiff?.content
      );

      this.promptText = prompt;
    } catch (e: unknown) {
      this.promptText = `Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
  },

  async generate() {
    const forceNew = this.ctrlHeld;
    this.generating = true;
    this.error = null;
    this.diff = null;
    this.scanIndex = 0;
    this.scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
    const startTime = Date.now();

    // Prevent navigation while generating
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // Standard for Chrome/Firefox
      return ''; // Standard for generic
    };

    this.scanInterval = setInterval(() => {
      this.scanIndex = (this.scanIndex + 1) % this.scanMessages.length;
    }, 4400);

    try {
      let profile = (this as any).$store.app.profile;
      const lastDiff = (this as any).$store.app.history[0];
      const apiKey = (this as any).$store.app.apiKey;

      // Resolve any unmapped custom items before fetching feeds
      const unmapped = getUnmappedItems(profile);
      if (unmapped.length > 0 && apiKey) {
        console.log(`Resolving ${unmapped.length} custom item(s):`, unmapped.map(u => u.item));
        const newMappings = { ...profile.resolvedMappings };
        for (const { item, category } of unmapped) {
          const mapping = await resolveSourcesForItem(apiKey, item, category);
          newMappings[item] = mapping;
          console.log(`Resolved "${item}":`, mapping);
        }
        // Save resolved mappings to profile
        (this as any).$store.app.updateProfile({ resolvedMappings: newMappings });
        // Refresh profile reference after update
        profile = (this as any).$store.app.profile;
      }

      // Calculate window for search
      const lastDiffDate = this.getLastDiffDate();
      const windowDays = lastDiffDate
        ? Math.min(Math.max(Math.ceil((Date.now() - new Date(lastDiffDate).getTime()) / 86400000), 1), 7)
        : 7;

      // Run web search and feed fetch in parallel
      const [webSearchResults, feedRes] = await Promise.all([
        apiKey ? searchWebForProfile(apiKey, profile, windowDays).catch(() => []) : Promise.resolve([]),
        fetch('/api/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languages: profile.languages || [],
            frameworks: profile.frameworks || [],
            tools: profile.tools || [],
            topics: profile.topics || [],
            resolvedMappings: profile.resolvedMappings || {},
          }),
        }).catch(() => null),
      ]);

      let feedContext = '';
      let webContext = '';

      // Process feed results
      if (feedRes?.ok) {
        try {
          const feedData = await feedRes.json();
          const feeds = feedData.feeds || {};

          // Curate general feeds (HN, Lobsters) for relevance
          const generalItems: FeedItem[] = [...(feeds.hn || []), ...(feeds.lobsters || [])];
          let curatedGeneral: FeedItem[] = generalItems;
          if (generalItems.length > 0 && apiKey) {
            curatedGeneral = await curateGeneralFeeds(apiKey, generalItems, profile);
          }

          // Combine curated general feeds with already-targeted feeds
          const allItems: FeedItem[] = [
            ...curatedGeneral,
            ...(feeds.reddit || []),
            ...(feeds.github || []),
            ...(feeds.devto || []),
          ];

          feedContext = formatItemsForPrompt(allItems);
        } catch {
          // Feed processing failed, continue without
        }
      }

      // Process web search results
      if (webSearchResults.length > 0) {
        webContext = formatWebSearchForPrompt(webSearchResults);
      }

      const prompt = buildPrompt(
        { ...profile, depth: this.selectedDepth },
        feedContext,
        this.getLastDiffDate(),
        lastDiff?.content,
        webContext
      );

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': (this as any).$store.app.apiKey!,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          tools: [{
            name: 'submit_diff',
            description: 'Submit the generated developer intelligence diff',
            input_schema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'A short, creative title (3-8 words) capturing the main theme of this diff. Plain text, no markdown.'
                },
                content: {
                  type: 'string',
                  description: 'The full markdown content of the diff, starting with the date line'
                }
              },
              required: ['title', 'content']
            }
          }],
          tool_choice: { type: 'tool', name: 'submit_diff' }
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `API error: ${res.status}`);
      }

      const result = await res.json();
      const toolUse = result.content.find((b: any) => b.type === 'tool_use');
      if (!toolUse?.input?.content) {
        throw new Error('No content returned from API');
      }

      const { title, content: rawContent } = toolUse.input;

      let cleanedContent = rawContent;
      const dateStart = cleanedContent.indexOf('Intelligence Window');
      const sectionStart = cleanedContent.indexOf('## ');
      let diffStart = -1;
      if (dateStart >= 0) {
        diffStart = cleanedContent.lastIndexOf('\n', dateStart);
        diffStart = diffStart >= 0 ? diffStart + 1 : 0;
      } else if (sectionStart >= 0) {
        diffStart = sectionStart;
      }
      if (diffStart > 0) {
        cleanedContent = cleanedContent.slice(diffStart);
      }

      const entry = {
        id: Date.now().toString(),
        title: title || '',
        content: cleanedContent,
        generated_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
      };

      this.diff = entry;

      const today = new Date().toDateString();
      const history = (this as any).$store.app.history;
      if (!forceNew && history.length > 0 && new Date(history[0].generated_at).toDateString() === today) {
        const oldDiffId = history[0].id;
        const starsToRemove = (this as any).$store.app.stars.filter((s: any) => s.diff_id === oldDiffId);
        for (const star of starsToRemove) {
          (this as any).$store.app._trackDeletedStar(starId(star.diff_id, star.p_index));
        }
        (this as any).$store.app.stars = (this as any).$store.app.stars.filter((s: any) => s.diff_id !== oldDiffId);
        (this as any).$store.app._trackDeletedDiff(oldDiffId);

        history[0] = entry;
        (this as any).$store.app.history = [...history];
        (this as any).$store.app._trackModifiedDiff(entry.id);
      } else {
        (this as any).$store.app.addDiff(entry);
      }

      (this as any).$store.app.autoSync();
    } catch (e: unknown) {
      this.error = `Failed to generate diff: ${e instanceof Error ? e.message : 'Unknown error'}`;
    } finally {
      this.generating = false;
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      window.onbeforeunload = null;
    }
  },

  handleBookmarkClick(event: MouseEvent) {
    const btn = (event.target as HTMLElement).closest('.bookmark-btn') as HTMLElement;
    if (!btn || !this.diff) return;

    const paragraph = btn.closest('.md-p, .md-list-item') as HTMLElement;
    if (!paragraph) return;

    const pIndex = parseInt(paragraph.dataset.p || '0', 10);

    if (btn.dataset.bookmarked === 'true') {
      const star = (this as any).$store.app.stars.find((s: any) => s.diff_id === this.diff.id && s.p_index === pIndex);
      if (star) (this as any).$store.app.removeStar(star.diff_id, star.p_index);
      btn.classList.remove('bookmark-btn-saved', 'bookmark-btn-existing');
      btn.innerHTML = '+';
      btn.title = 'Add to Stars';
      btn.dataset.bookmarked = 'false';
      (this as any).$store.app.autoSync();
      return;
    }

    (this as any).$store.app.addStar({
      diff_id: this.diff.id,
      p_index: pIndex,
      added_at: new Date().toISOString()
    });

    (this as any).$store.app.autoSync();

    btn.classList.add('bookmark-btn-saved', 'bookmark-btn-existing');
    btn.innerHTML = '';
    btn.title = 'Unstar';
    btn.dataset.bookmarked = 'true';
  },

  injectBookmarkButtons() {
    setTimeout(() => {
      const container = document.querySelector('.diff-content');
      if (!container || !this.diff) return;

      const paragraphs = container.querySelectorAll('.md-p, .md-list-item');
      paragraphs.forEach((p) => {
        if (p.querySelector('.bookmark-btn')) return;
        if (!p.querySelector('.md-link')) return;

        const pIndex = parseInt((p as HTMLElement).dataset.p || '0', 10);
        const isBookmarked = (this as any).$store.app.isStarred(this.diff.id, pIndex);

        const btn = document.createElement('button');
        btn.className = 'bookmark-btn' + (isBookmarked ? ' bookmark-btn-existing' : '');
        btn.innerHTML = isBookmarked ? '' : '+';
        btn.title = isBookmarked ? 'Unstar' : 'Add to Stars';
        btn.dataset.bookmarked = isBookmarked ? 'true' : 'false';
        p.appendChild(btn);
      });
    }, 50);
  },

  scrollToAndHighlight(pIndex: number) {
    // Wait for diff to render
    setTimeout(() => {
      const container = document.querySelector('.diff-content');
      if (!container) return;

      const paragraph = container.querySelector(`[data-p="${pIndex}"]`) as HTMLElement;
      if (!paragraph) return;

      paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
      paragraph.classList.add('bookmark-highlight');
      paragraph.addEventListener('animationend', () => {
        paragraph.classList.remove('bookmark-highlight');
      }, { once: true });
    }, 100);
  },

  needsSyncPrompt(): boolean {
    if (this.syncBannerDismissed) return false;
    if (!(this as any).$store.app.profile?.syncedAt) return false;
    if ((this as any).$store.app._syncPassword) return false;
    return (this as any).$store.app.hasPendingChanges();
  },

  dismissSyncBanner() {
    this.syncBannerDismissed = true;
  }
}));
