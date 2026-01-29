import Alpine from 'alpinejs';
import { renderMarkdown } from '../lib/markdown';

interface PublicDiff {
  id: string;
  content: string;
  title?: string;
  generated_at: string;
  profile_name: string;
}

Alpine.data('publicDiff', () => ({
  loading: true,
  error: null as string | null,
  diff: null as PublicDiff | null,
  profileName: '',
  renderedContent: '',

  async init() {
    // Parse diff ID from query: /d?123456
    const diffId = window.location.search.slice(1); // Remove leading '?'

    if (!diffId) {
      this.error = 'No diff ID provided';
      this.loading = false;
      return;
    }

    try {
      const res = await fetch(`/api/diff/${diffId}/public`);

      if (!res.ok) {
        if (res.status === 404) {
          this.error = 'This diff is not available or has been made private.';
        } else {
          this.error = 'Failed to load diff';
        }
        this.loading = false;
        return;
      }

      this.diff = await res.json();
      this.profileName = this.diff!.profile_name;
      this.renderedContent = renderMarkdown(this.diff!.content);

      // Update page title
      if (this.diff?.title) {
        document.title = `${this.diff.title} - diff·log`;
      }
    } catch (e) {
      this.error = 'Failed to load diff';
    } finally {
      this.loading = false;
    }
  }
}));
