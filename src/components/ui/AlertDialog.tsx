import { Dialog } from './Dialog'
import { Button } from './button'

interface AlertDialogProps {
  open: boolean
  title: string
  message: string
  onClose: () => void
}

export function AlertDialog({ open, title, message, onClose }: AlertDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button type="button" size="sm" onClick={onClose}>
          OK
        </Button>
      }
    >
      {message}
    </Dialog>
  )
}
