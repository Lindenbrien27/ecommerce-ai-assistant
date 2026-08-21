import { useEffect, useState } from "react"
import { formatBytes, useFileUpload } from "@/hooks/use-file-upload";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ImageIcon, VideoIcon, HeadphonesIcon, FileTextIcon, FileSpreadsheetIcon, FileArchiveIcon, UploadIcon, XIcon, CircleAlertIcon, RefreshCwIcon } from "lucide-react"

export function Pattern({
  maxFiles = 5,

  maxSize = 10 * 1024 * 1024,

  accept = "*",
  multiple = true,
  className,
  onFilesChange,
  simulateUpload = true
}) {

  const defaultImages = [
    {
      id: "default-3",
      name: "image-1.png",
      size: 42048,
      type: "image/png",
      url: "https://picsum.photos/1000/800?grayscale&random=10",
    },
    {
      id: "default-4",
      name: "image-2.png",
      size: 62807,
      type: "image/png",
      url: "https://picsum.photos/1000/800?grayscale&random=11",
    },
  ]

  const defaultUploadFiles = defaultImages.map((image) => ({
    id: image.id,
    file: {
      name: image.name,
      size: image.size,
      type: image.type
    },
    preview: image.url,
    progress: 100,
    status: "completed",
  }))

  const [uploadFiles, setUploadFiles] =
    useState(defaultUploadFiles)

  const [
    { isDragging, errors },
    {
      removeFile,
      clearFiles,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      getInputProps,
    },
  ] = useFileUpload({
    maxFiles,
    maxSize,
    accept,
    multiple,
    initialFiles: defaultImages,
    onFilesChange: (newFiles) => {

      const newUploadFiles = newFiles.map((file) => {

        const existingFile = uploadFiles.find((existing) => existing.id === file.id)

        if (existingFile) {

          return {
            ...existingFile,
            ...file,
          }
        } else {

          return {
            ...file,
            progress: 0,
            status: "uploading",
          };
        }
      })
      setUploadFiles(newUploadFiles)
      onFilesChange?.(newFiles)
    },
  })

  useEffect(() => {
    if (!simulateUpload) return

    const interval = setInterval(() => {
      setUploadFiles((prev) =>
        prev.map((file) => {
          if (file.status !== "uploading") return file

          const increment = Math.random() * 15 + 5
          const newProgress = Math.min(file.progress + increment, 100)

          if (newProgress > 50 && Math.random() < 0.1) {
            return {
              ...file,
              status: "error",
              error: "Upload failed. Please try again.",
            };
          }

          if (newProgress >= 100) {
            return {
              ...file,
              progress: 100,
              status: "completed",
            };
          }

          return {
            ...file,
            progress: newProgress,
          }
        }))
    }, 500)

    return () => clearInterval(interval);
  }, [simulateUpload])

  const retryUpload = (fileId) => {
    setUploadFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? {
              ...file,
              progress: 0,
              status: "uploading",
              error: undefined,
            }
          : file))
  }

  const removeUploadFile = (fileId) => {
    setUploadFiles((prev) => prev.filter((file) => file.id !== fileId))
    removeFile(fileId)
  }

  const getFileIcon = (file) => {
    const type = file instanceof File ? file.type : file.type
    if (type.startsWith("image/"))
      return (<ImageIcon className="size-4" />);
    if (type.startsWith("video/"))
      return (<VideoIcon className="size-4" />);
    if (type.startsWith("audio/"))
      return (<HeadphonesIcon className="size-4" />);
    if (type.includes("pdf"))
      return (<FileTextIcon className="size-4" />);
    if (type.includes("word") || type.includes("doc"))
      return (<FileTextIcon className="size-4" />);
    if (type.includes("excel") || type.includes("sheet"))
      return (<FileSpreadsheetIcon className="size-4" />);
    if (type.includes("zip") || type.includes("rar"))
      return (<FileArchiveIcon className="size-4" />);
    return (<FileTextIcon className="size-4" />);
  }

  const completedCount = uploadFiles.filter((f) => f.status === "completed").length
  const errorCount = uploadFiles.filter((f) => f.status === "error").length
  const uploadingCount = uploadFiles.filter((f) => f.status === "uploading").length

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      {}
      <div
        className={cn(
          "rounded-lg relative border border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}>
        <input {...getInputProps()} className="sr-only" />

        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full",
              isDragging ? "bg-primary/10" : "bg-muted"
            )}>
            <UploadIcon
              className={cn("h-6", isDragging ? "text-primary" : "text-muted-foreground")} />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Upload your files</h3>
            <p className="text-muted-foreground text-sm">
              Drag and drop files here or click to browse
            </p>
            <p className="text-muted-foreground text-xs">
              Support for multiple file types up to {formatBytes(maxSize)} each
            </p>
          </div>

          <Button onClick={openFileDialog}>
            <UploadIcon className="h-4 w-4" />
            Select files
          </Button>
        </div>
      </div>
      {}
      {uploadFiles.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium">Upload Progress</h4>
            <div className="flex items-center gap-2">
              {completedCount > 0 && (
                <Badge size="sm" variant="success-light">
                  Completed: {completedCount}
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge size="sm" variant="destructive">
                  Failed: {errorCount}
                </Badge>
              )}
              {uploadingCount > 0 && (
                <Badge size="sm" variant="secondary">
                  Uploading: {uploadingCount}
                </Badge>
              )}
            </div>
          </div>

          <Button onClick={clearFiles} variant="outline" size="sm">
            Clear all
          </Button>
        </div>
      )}
      {}
      {uploadFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploadFiles.map((fileItem) => (
            <div
              key={fileItem.id}
              className="border-border bg-card rounded-lg border p-2.5">
              <div className="flex items-start gap-2.5">
                {}
                <div className="shrink-0">
                  {fileItem.preview &&
                  fileItem.file.type.startsWith("image/") ? (
                    <img
                      src={fileItem.preview}
                      alt={fileItem.file.name}
                      className="rounded-lg h-12 w-12 border object-cover" />
                  ) : (
                    <div
                      className="border-border text-muted-foreground rounded-lg flex h-12 w-12 items-center justify-center border">
                      {getFileIcon(fileItem.file)}
                    </div>
                  )}
                </div>

                {}
                <div className="min-w-0 flex-1">
                  <div className="mt-0.75 flex items-center justify-between">
                    <p
                      className="inline-flex flex-col justify-center gap-1 truncate font-medium">
                      <span className="text-sm">{fileItem.file.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(fileItem.file.size)}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      {}
                      <Button
                        onClick={() => removeUploadFile(fileItem.id)}
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground size-6 hover:bg-transparent hover:opacity-100">
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {}
                  {fileItem.status === "uploading" && (
                    <div className="mt-2">
                      <Progress value={fileItem.progress} className="h-1" />
                    </div>
                  )}

                  {}
                  {fileItem.status === "error" && fileItem.error && (
                    <Alert variant="destructive" className="mt-2 px-2 py-1">
                      <CircleAlertIcon className="size-4" />
                      <AlertTitle className="text-xs">
                        {fileItem.error}
                      </AlertTitle>
                      <AlertAction>
                        <Button
                          onClick={() => retryUpload(fileItem.id)}
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground size-6 hover:bg-transparent hover:opacity-100">
                          <RefreshCwIcon className="size-3.5" />
                        </Button>
                      </AlertAction>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {}
      {errors.length > 0 && (
        <Alert variant="destructive" className="mt-5">
          <CircleAlertIcon />
          <AlertTitle>File upload error(s)</AlertTitle>
          <AlertDescription>
            {errors.map((error, index) => (
              <p key={index} className="last:mb-0">
                {error}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}