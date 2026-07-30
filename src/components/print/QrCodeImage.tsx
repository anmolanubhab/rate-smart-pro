import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Renders a QR code image from arbitrary text (e.g. a GST e-invoice signed QR
// payload, or a plain verification string) for the print engine. Generates
// client-side via the `qrcode` package — no network call, safe to run inside
// a print preview.
export default function QrCodeImage({ value, sizePx = 90 }: { value: string; sizePx?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 0, width: sizePx * 2, errorCorrectionLevel: "M" })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [value, sizePx]);

  if (!dataUrl) return <div style={{ width: sizePx, height: sizePx }} className="border border-black/30" />;
  return <img src={dataUrl} alt="QR code" width={sizePx} height={sizePx} style={{ width: sizePx, height: sizePx }} />;
}
