import { useState } from 'react';
import { useFileUpload } from '../hooks/use-file-upload.js';
import { Button } from './ui/button.jsx';
import { Progress } from './ui/progress.jsx';
import { Alert, AlertDescription, AlertTitle } from './reui/alert.jsx';
import { CircleAlertIcon, ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import { cn } from '../lib/utils.js';

export function AdminProductPhotoUpload({ value, onChange }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const [{ isDragging, errors: validationErrors }, { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps }] =
    useFileUpload({
      accept: 'image/png,image/jpeg,image/webp,image/gif',
      maxSize: 5 * 1024 * 1024,
      multiple: false,
      onFilesAdded: (files) => uploadFile(files[0]?.file),
    });

  async function uploadFile(file) {
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const body = new FormData();
      body.append('image', file);
      const res = await fetch('/api/admin/products/uploads', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong uploading that image.');
      onChange(data.url);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  return (
    <div className="w-full">
      <div
        className={cn(
          'relative rounded-lg border border-dashed p-4 text-center transition-colors cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-input hover:border-muted-foreground/50'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input {...getInputProps()} className="sr-only" />

        {value ? (
          <div className="flex items-center gap-3">
            <img src={value} alt="Product cover" className="h-16 w-16 rounded-md border object-cover" />
            <div className="flex-1 text-left text-sm text-muted-foreground truncate">{value}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              {status === 'uploading' ? <ImageIcon className="size-5 text-muted-foreground" /> : <UploadIcon className="size-5 text-muted-foreground" />}
            </div>
            <p className="text-sm font-medium">Drag and drop a photo, or click to browse</p>
            <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, or GIF up to 5MB</p>
          </div>
        )}

        {status === 'uploading' && (
          <div className="mt-3">
            <Progress value={70} className="h-1" />
          </div>
        )}
      </div>

      {(error || validationErrors.length > 0) && (
        <Alert variant="destructive" className="mt-2">
          <CircleAlertIcon className="size-4" />
          <AlertTitle>{error || validationErrors[0]}</AlertTitle>
          <AlertDescription />
        </Alert>
      )}
    </div>
  );
}
