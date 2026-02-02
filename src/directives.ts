import type Alpine from 'alpinejs';

export function registerDirectives(alpine: typeof Alpine) {
  // x-dialog directive for native <dialog> elements
  // Usage: <dialog x-dialog="showModal" @close="cleanup()">
  alpine.directive('dialog', (el, { expression }, { effect, evaluate, cleanup }) => {
    const dialog = el as HTMLDialogElement;

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === el) dialog.close();
    };

    const handleClose = () => {
      evaluate(`${expression} = false`);
    };

    el.addEventListener('click', handleBackdropClick);
    el.addEventListener('close', handleClose);

    effect(() => {
      const shouldBeOpen = evaluate(expression) as boolean;
      if (shouldBeOpen && !dialog.open) {
        dialog.showModal();
      } else if (!shouldBeOpen && dialog.open) {
        dialog.close();
      }
    });

    cleanup(() => {
      el.removeEventListener('click', handleBackdropClick);
      el.removeEventListener('close', handleClose);
    });
  });

  // x-dialog-close directive for buttons inside dialogs
  // Usage: <button x-dialog-close>Cancel</button>
  alpine.directive('dialog-close', (el, _, { cleanup }) => {
    const handleClick = () => el.closest('dialog')?.close();
    el.addEventListener('click', handleClick);
    cleanup(() => el.removeEventListener('click', handleClick));
  });
}
