import React from 'react';

export const BRAND_NAME = 'Secure360 Hub';
export const BRAND_TAGLINE = 'Insight. Innovate. Impact.';
const LOGO_SRC = `${import.meta.env.BASE_URL}third-eye-logo.png`;

function FullLogo({ maxWidth = 220, padding = '1rem 1.25rem', rounded = 12, shadow = true }) {
  return (
    <div
      className="mx-auto bg-white overflow-hidden"
      style={{
        width: '100%',
        maxWidth,
        padding,
        borderRadius: rounded,
        border: '1px solid #d7e3f1',
        boxShadow: shadow ? '0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 24px rgba(15, 23, 42, 0.05)' : 'none',
      }}
    >
      <img
        src={LOGO_SRC}
        alt={BRAND_NAME}
        className="w-full h-auto object-contain"
      />
    </div>
  );
}

function HighlightWordmark({ tone = 'light' }) {
  const textColor = tone === 'dark' ? '#17324f' : '#f8fbff';
  const highlightColor = tone === 'dark' ? '#0078d4' : '#60b7ff';

  return (
    <div
      className="font-display font-bold tracking-tight"
      style={{ color: textColor }}
    >
      <span>Secure</span>
      <span style={{ color: highlightColor }}>360</span>
      <span> Hub</span>
    </div>
  );
}

export default function BrandLogo({ variant = 'sidebar' }) {
  if (variant === 'panel') {
    return (
      <div className="flex flex-col items-center text-center w-full max-w-[360px]">
        <FullLogo maxWidth={320} padding="1rem 1.25rem" rounded={16} />
        <div className="mt-4 text-[1.7rem] leading-tight drop-shadow-sm">
          <HighlightWordmark />
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-col items-start text-left w-full">
        <FullLogo maxWidth={160} padding="0.55rem 0.75rem" rounded={10} shadow={false} />
        <div className="mt-2 text-[15px] leading-tight">
          <HighlightWordmark />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center w-full">
      <FullLogo maxWidth={192} padding="0.6rem 0.85rem" rounded={10} shadow={false} />
      <div className="mt-3 text-[15px] leading-tight">
        <HighlightWordmark tone="dark" />
      </div>
    </div>
  );
}
