import { useEffect, useId, useState } from 'react'
import { Dialog } from './Dialog'
import { Button } from './button'
import { Input } from './input'

interface PromptDialogProps {
  open: boolean
  title: string
  label?: string
  defaultValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  open,
  title,
  label,
  defaultValue = '',
  confirmLabel = 'Save',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputId = useId()

  // Re-seed each time the dialog opens (a fresh target may have a different
  // current value than the one it was last closed with).
  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onSubmit(value)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {label && (
        <label className="mb-1 block text-xs font-medium text-foreground" htmlFor={inputId}>
          {label}
        </label>
      )}
      <Input
        id={inputId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value)
        }}
      />
    </Dialog>
  )
}
