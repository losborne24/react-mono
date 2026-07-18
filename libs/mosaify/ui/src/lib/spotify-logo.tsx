export interface SpotifyLogoProps {
  size?: number;
}

export function SpotifyLogo({ size = 28 }: SpotifyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.516 17.312a.748.748 0 01-1.03.25c-2.822-1.724-6.372-2.114-10.556-1.158a.748.748 0 01-.332-1.46c4.578-1.046 8.503-.595 11.668 1.339a.748.748 0 01.25 1.03zm1.472-3.274a.936.936 0 01-1.288.308c-3.228-1.984-8.15-2.56-11.97-1.401a.937.937 0 01-.548-1.791c4.363-1.33 9.786-.686 13.498 1.596a.936.936 0 01.308 1.288zm.126-3.408c-3.873-2.3-10.257-2.512-13.95-1.39a1.123 1.123 0 11-.652-2.15c4.243-1.287 11.296-1.039 15.748 1.608a1.123 1.123 0 01-1.146 1.932z" />
    </svg>
  );
}

export default SpotifyLogo;
