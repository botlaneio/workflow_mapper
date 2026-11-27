export function Logo({ src, wordmark }: { src: string; wordmark: string }) {
  return (
    <img className="logo" src={src} alt={wordmark} height={36} />
  );
}
