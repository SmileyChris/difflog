/**
 * Svelte action that triggers a callback when clicking outside the element.
 * Used for closing dropdowns, modals, and other overlay elements.
 *
 * @example
 * <div use:clickOutside={() => isOpen = false}>
 *   Dropdown content
 * </div>
 */
export function clickOutside(node: HTMLElement, callback: () => void) {
	function handleClick(event: MouseEvent) {
		if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
			callback();
		}
	}

	document.addEventListener('click', handleClick, true);

	return {
		update(newCallback: () => void) {
			callback = newCallback;
		},
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
