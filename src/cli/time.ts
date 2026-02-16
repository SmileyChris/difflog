/** CLI time utilities — delegates to shared pure module with Date.now(). */
export { formatDiffDate } from '../lib/utils/time';
import { timeAgoFrom } from '../lib/utils/time';

export function timeAgo(dateStr: string): string {
	return timeAgoFrom(dateStr, Date.now());
}
