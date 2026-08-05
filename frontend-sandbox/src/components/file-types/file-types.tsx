import pdfIcon from "./icons/pdf.svg";
import pngIcon from "./icons/png.svg";
import jpgIcon from "./icons/jpg.svg";
import csvIcon from "./icons/csv.svg";
import rawIcon from "./icons/raw.svg";
import txtIcon from "./icons/txt.svg";
import xlsIcon from "./icons/xls.svg";
import docIcon from "./icons/doc.svg";
import svgIcon from "./icons/svg.svg";
import pptIcon from "./icons/ppt.svg";
import psIcon from "./icons/ps.svg";
import sourcePageIcon from "./icons/source-page.svg";
import sourceFoldIcon from "./icons/source-fold.svg";

// Ported from the "shadcn-ui - Design System by ReUI" Figma file (File
// Types component, node 40561:17900). Each file-type glyph (color, shape,
// and the extension label) is baked directly into its own exported SVG -
// these aren't a shared outline plus a separate color/text overlay, so
// there's nothing to compose in code beyond rendering the right asset.
// Assets are downloaded and committed locally (not hotlinked to Figma's
// own asset URLs, which expire after about a week).
export const FILE_TYPES = [
  { name: "pdf", label: "PDF", icon: pdfIcon },
  { name: "png", label: "PNG", icon: pngIcon },
  { name: "jpg", label: "JPG", icon: jpgIcon },
  { name: "csv", label: "CSV", icon: csvIcon },
  { name: "raw", label: "RAW", icon: rawIcon },
  { name: "txt", label: "TXT", icon: txtIcon },
  { name: "xls", label: "XLS", icon: xlsIcon },
  { name: "doc", label: "DOC", icon: docIcon },
  { name: "svg", label: "SVG", icon: svgIcon },
  { name: "ppt", label: "PPT", icon: pptIcon },
  { name: "ps", label: "PS", icon: psIcon },
] as const;

export type FileTypeName = (typeof FILE_TYPES)[number]["name"];

function FileTypeIcon({ name, className }: { name: FileTypeName; className?: string }) {
  const fileType = FILE_TYPES.find((t) => t.name === name);
  if (!fileType) return null;
  return <img src={fileType.icon} alt={fileType.label} className={className ?? "size-10"} />;
}

// "Source" is its own two-part icon (a plain page shape + a small orange
// "Source" label), distinct from the pre-colored FILE_TYPES icons above -
// kept as a separate component rather than folded into the FILE_TYPES list
// since it isn't a file extension.
function SourceIcon({ className }: { className?: string }) {
  return (
    <div className={className ?? "relative size-10"}>
      <img src={sourcePageIcon} alt="" className="absolute inset-[8.33%_16.67%] size-full" />
      <img src={sourceFoldIcon} alt="" className="absolute inset-[8.33%_16.67%_66.67%_58.33%] size-full" />
      <div className="absolute top-[18px] left-[2px] flex items-center rounded-xs bg-[#f54900] px-0.5">
        <p className="text-2xs leading-[14px] font-medium whitespace-nowrap text-white">Source</p>
      </div>
    </div>
  );
}

export function FileTypesGrid() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      {FILE_TYPES.map((t) => (
        <FileTypeIcon key={t.name} name={t.name} />
      ))}
      <SourceIcon />
    </div>
  );
}

export { FileTypeIcon, SourceIcon };
