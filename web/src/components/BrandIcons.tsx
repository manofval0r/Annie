import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function GmailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
      <path d="M8.5 14h2M13.5 14h2M8.5 17.5h2" />
    </svg>
  );
}

export function SearchConsoleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19.5h16" />
      <path d="M6.5 16V11M11.5 16V7.5M16.5 16V4.5" />
    </svg>
  );
}

export function OutlookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="11" height="16" rx="2" />
      <circle cx="8.5" cy="12" r="2.75" />
      <path d="M14 7.5h5.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M14 10l3.5 2.5L21 10" />
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
      <path d="M9 18c-4.5 2-5-2-7-2" />
    </svg>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21.5 3.5 2.5 10.8l6.8 2.4L18.5 6.5l-6.7 8.4v5.6l3.4-3.6 4.3 3.1 2-16.5Z" />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.5 11.8a8.5 8.5 0 0 1-12.5 7.5L3.5 20.5l1.3-4.3A8.5 8.5 0 1 1 20.5 11.8Z" />
      <path d="M9.5 9.2c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.2.1.5-.1.7l-.5.6c.4.8 1.2 1.6 2 2l.6-.5c.2-.2.5-.2.7-.1l1.7.7c.3.1.4.3.4.5v.5c0 .3 0 .6-.4.8-.6.4-1.7.5-3.2-.2-1.8-.8-3.4-2.4-4.2-4.2-.7-1.5-.6-2.6-.2-3.2Z" />
    </svg>
  );
}

export function IMessageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3.5c5.2 0 9.5 3.6 9.5 8s-4.3 8-9.5 8c-1.3 0-2.6-.2-3.7-.7L4 20.5l1.2-3.2C3.5 15.8 2.5 13.8 2.5 11.5c0-4.4 4.3-8 9.5-8Z" />
    </svg>
  );
}

export function TregIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
      <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
    </svg>
  );
}
