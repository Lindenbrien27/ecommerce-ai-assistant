import { IconTile } from "@/components/reui/icon-tile"
import { FolderIcon } from "lucide-react"

export function Pattern() {
  return (
    <div className="flex items-center justify-center">
      <IconTile aria-hidden="true">
        <FolderIcon
        />
      </IconTile>
    </div>
  )
}