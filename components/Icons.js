// Stroke icons (24px grid). Kept in one place so every screen looks consistent.

function Svg({ size = 22, stroke = 2, children, fill = 'none', ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

export const IconBack = p => <Svg {...p} stroke={2.4}><path d="M15 18l-6-6 6-6" /></Svg>
export const IconChevron = p => <Svg size={18} {...p} stroke={2.2}><path d="M9 18l6-6-6-6" /></Svg>
export const IconHome = p => <Svg {...p}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5" /></Svg>
export const IconMap = p => <Svg {...p}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></Svg>
export const IconPlus = p => <Svg {...p} stroke={2.4}><path d="M12 5v14M5 12h14" /></Svg>
export const IconSearch = p => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
export const IconPhone = p => <Svg {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" /></Svg>
export const IconPin = ({ filled, ...p }) => <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 17v5" /><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6z" /></Svg>
export const IconTrash = p => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /></Svg>
export const IconEdit = p => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>
export const IconMove = p => <Svg {...p}><path d="M7 17L17 7M8 7h9v9" /></Svg>
export const IconStar = ({ filled, ...p }) => <Svg {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9L12 2.5z" /></Svg>
export const IconCalendar = p => <Svg {...p}><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></Svg>
export const IconNote = p => <Svg {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></Svg>
export const IconCamera = p => <Svg {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></Svg>
export const IconUserPlus = p => <Svg {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></Svg>
export const IconCheck = p => <Svg {...p} stroke={2.6}><path d="M20 6L9 17l-5-5" /></Svg>
export const IconBolt = p => <Svg {...p} fill="currentColor" stroke="none"><path d="M13 2L4.1 12.6c-.4.5 0 1.2.6 1.2H11l-1 8.2 8.9-10.6c.4-.5 0-1.2-.6-1.2H13l1-8.2z" /></Svg>
export const IconSparkles = p => <Svg {...p}><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></Svg>
export const IconSettings = p => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Svg>
export const IconX = p => <Svg {...p} stroke={2.4}><path d="M18 6L6 18M6 6l12 12" /></Svg>
export const IconMore = p => <Svg {...p} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></Svg>
export const IconCloudOff = p => <Svg {...p}><path d="M22.6 16.3A5 5 0 0018 10h-1.3A8 8 0 006.7 5.3M5 5a8 8 0 00.5 13H18" /><path d="M2 2l20 20" /></Svg>
export const IconRefresh = p => <Svg {...p}><path d="M21 12a9 9 0 01-15.4 6.4L3 16M3 12A9 9 0 0118.4 5.6L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></Svg>
export const IconUsers = p => <Svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /></Svg>
export const IconTag = p => <Svg {...p}><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z" /><circle cx="7" cy="7" r="1.5" /></Svg>
export const IconDownload = p => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>
export const IconLayers = p => <Svg {...p}><path d="M12 2l10 5-10 5L2 7l10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></Svg>
export const IconKey = p => <Svg {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2" /></Svg>

export function IconWhatsApp({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35z" />
      <path d="M12 0C5.37 0 0 5.37 0 12c0 2.13.56 4.12 1.53 5.85L.06 23.55a.5.5 0 00.61.62l5.84-1.53A11.94 11.94 0 0012 24c6.63 0 12-5.37 12-12S18.63 0 12 0zm0 21.9c-1.84 0-3.55-.5-5.03-1.38l-.36-.21-3.73.98 1-3.65-.24-.37A9.86 9.86 0 012.1 12C2.1 6.53 6.53 2.1 12 2.1S21.9 6.53 21.9 12 17.47 21.9 12 21.9z" />
    </svg>
  )
}
