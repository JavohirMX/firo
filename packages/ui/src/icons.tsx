import React from "react";

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
};

/**
 * Authored in-repo SVG icons for the Firo shell (ADR-0023).
 *
 * Drawn to a 20x20 viewbox with 1.75px stroke and round stroke line joins.
 * Uses currentColor to adapt to parent themes.
 */

export const SelectIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 3L14.5 10L10 11.5L8 16.5L4 3Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HandIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M8 11V5.5C8 4.67 8.67 4 9.5 4C10.33 4 11 4.67 11 5.5V10.5M11 7.5C11 6.67 11.67 6 12.5 6C13.33 6 14 6.67 14 7.5V11M14 9.5C14 8.67 14.67 8 15.5 8C16.33 8 17 8.67 17 9.5V13.5C17 16 15 18 12.5 18H10C7.5 18 5 15.5 4 13L6.5 11.5C7.2 11.1 8 11.6 8 12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const StickyNoteIcon: React.FC<IconProps> = ({
  size = 20,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3.5 4C3.5 3.72386 3.72386 3.5 4 3.5H16C16.2761 3.5 16.5 3.72386 16.5 4V12.5L12.5 16.5H4C3.72386 16.5 3.5 16.2761 3.5 16V4Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.5 12.5V16.5L16.5 12.5H12.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RectangleIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="4.5"
      width="13"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.75"
    />
  </svg>
);

export const DiamondIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M10 3.5L16.5 10L10 16.5L3.5 10L10 3.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EllipseIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export const ArrowIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4.5 15.5L15 5M15 5H9.5M15 5V10.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LineIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4.5 15.5L15.5 4.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const TextIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4.5 5.5H15.5M10 5.5V16"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PenIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M13.5 3.5L16.5 6.5L6.5 16.5H3.5V13.5L13.5 3.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const FrameIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M6 3V17M14 3V17M3 6H17M3 14H17"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const EraserIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M13 3.5L17 7.5L8.5 16H4V12.5L13 3.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9 16H16"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const LaserIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M5 15L12 8M13.5 6.5L15 5M16.5 3.5L17 3M15 9.5L16.5 11M8.5 3L10.5 4.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const UndoIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M7 6H4M4 6V9M4 6L8.5 10.5C11.5 13.5 16.5 12.5 16.5 8.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RedoIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M13 6H16M16 6V9M16 6L11.5 10.5C8.5 13.5 3.5 12.5 3.5 8.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ZoomInIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M13.5 13.5L16.5 16.5M9 6.5V11.5M6.5 9H11.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const ZoomOutIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M13.5 13.5L16.5 16.5M6.5 9H11.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const ZoomFitIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 7V4H7M13 4H16V7M16 13V16H13M7 16H4V13"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MinimapIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="3.5"
      width="13"
      height="13"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <rect
      x="9"
      y="9"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.25"
    />
  </svg>
);

export const GridIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="5" cy="5" r="1" fill="currentColor" />
    <circle cx="10" cy="5" r="1" fill="currentColor" />
    <circle cx="15" cy="5" r="1" fill="currentColor" />
    <circle cx="5" cy="10" r="1" fill="currentColor" />
    <circle cx="10" cy="10" r="1" fill="currentColor" />
    <circle cx="15" cy="10" r="1" fill="currentColor" />
    <circle cx="5" cy="15" r="1" fill="currentColor" />
    <circle cx="10" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
  </svg>
);

export const MenuHamburgerIcon: React.FC<IconProps> = ({
  size = 20,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3.5 5.5H16.5M3.5 10H16.5M3.5 14.5H16.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const ChevronDownIcon: React.FC<IconProps> = ({
  size = 16,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 6L8 10L12 6"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 4L12 12M12 4L4 12"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const DuplicateIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="3.5"
      width="9"
      height="9"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <path
      d="M7.5 16.5H15C15.8284 16.5 16.5 15.8284 16.5 15V7.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4.5 6H15.5M8 6V4.5H12V6M6 6L6.7 15.2C6.75 15.94 7.37 16.5 8.11 16.5H11.89C12.63 16.5 13.25 15.94 13.3 15.2L14 6"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="4.5"
      y="8.5"
      width="11"
      height="8"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <path
      d="M7 8.5V6.5C7 4.84 8.34 3.5 10 3.5C11.66 3.5 13 4.84 13 6.5V8.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const UnlockIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="4.5"
      y="8.5"
      width="11"
      height="8"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <path
      d="M7 8.5V6.5C7 4.84 8.34 3.5 10 3.5C11.1 3.5 12.06 4.05 12.62 4.88"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const BringToFrontIcon: React.FC<IconProps> = ({
  size = 20,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="3.5"
      width="9"
      height="9"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <path
      d="M8.5 12.5V16.5H12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.5 9.5V4.5M15.5 4.5L13.5 6.5M15.5 4.5L17.5 6.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M10 4V16M4 10H16"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M12.5 12.5L16 16"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

export const PencilIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M12.5 4.5L15.5 7.5L7 16H4V13L12.5 4.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RestoreIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4.5 8.5C5.4 5.9 7.5 4.5 10 4.5C13.04 4.5 15.5 6.96 15.5 10C15.5 13.04 13.04 15.5 10 15.5C7.62 15.5 5.6 14.02 4.78 12"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <path
      d="M4.5 4.5V8.5H8.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M10 6.5V10L12.5 11.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BoardsIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="4.5"
      width="13"
      height="11"
      rx="1.75"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <path
      d="M3.5 8H16.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * A speech bubble, for the comment lane.
 *
 * The tail on the lower-left is what reads it as a *comment* rather than an
 * empty chat icon; the two dots are placed high enough to stay clear of it at
 * 16px, which is the pin's size on the canvas.
 */
export const CommentIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 4.75C4 3.78 4.78 3 5.75 3H14.25C15.22 3 16 3.78 16 4.75V11.25C16 12.22 15.22 13 14.25 13H8.5L5 16V13H5.75C4.78 13 4 12.22 4 11.25V4.75Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.5 8H12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

/** A check in a circle, for a resolved comment thread. */
export const CheckIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M7 10.25L9 12.25L13 8"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export type StarIconProps = IconProps & {
  filled?: boolean;
};

export const StarIcon: React.FC<StarIconProps> = ({
  size = 20,
  filled = false,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill={filled ? "currentColor" : "none"}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M10 2.5L12.3 7.4L17.7 8.1L13.8 11.9L14.7 17.2L10 14.6L5.3 17.2L6.2 11.9L2.3 8.1L7.7 7.4L10 2.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const StarFilledIcon: React.FC<IconProps> = (props) => (
  <StarIcon filled {...props} />
);

export const StarOutlineIcon: React.FC<IconProps> = (props) => (
  <StarIcon filled={false} {...props} />
);

export const FolderIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3 5.5C3 4.67 3.67 4 4.5 4H8L9.8 6.25C10.1 6.63 10.55 6.85 11.03 6.85H15.5C16.33 6.85 17 7.52 17 8.35V14.5C17 15.33 16.33 16 15.5 16H4.5C3.67 16 3 15.33 3 14.5V5.5Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GridViewIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect
      x="3.5"
      y="3.5"
      width="5.5"
      height="5.5"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <rect
      x="11"
      y="3.5"
      width="5.5"
      height="5.5"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <rect
      x="3.5"
      y="11"
      width="5.5"
      height="5.5"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.75"
    />
    <rect
      x="11"
      y="11"
      width="5.5"
      height="5.5"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.75"
    />
  </svg>
);

export const ListViewIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3.5 5.5H5.5M8.5 5.5H16.5M3.5 10H5.5M8.5 10H16.5M3.5 14.5H5.5M8.5 14.5H16.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SortIcon: React.FC<IconProps> = ({ size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 6H11M4 10H9M4 14H7M13.5 4.5V15.5M13.5 15.5L16.5 12.5M13.5 15.5L10.5 12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MoreVerticalIcon: React.FC<IconProps> = ({
  size = 20,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <circle cx="10" cy="4.5" r="1.25" fill="currentColor" />
    <circle cx="10" cy="10" r="1.25" fill="currentColor" />
    <circle cx="10" cy="15.5" r="1.25" fill="currentColor" />
  </svg>
);
