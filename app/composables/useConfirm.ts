import IcConfirmModal from '~/components/ic/ConfirmModal.vue'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button: the action removes or cancels something. */
  danger?: boolean
}

/** Asks for confirmation in a modal; resolves true when the user confirms. Call it in setup. */
export function useConfirm() {
  const overlay = useOverlay()
  const modal = overlay.create(IcConfirmModal)
  return async (options: ConfirmOptions): Promise<boolean> => {
    const instance = modal.open(options)
    return Boolean(await instance.result)
  }
}
