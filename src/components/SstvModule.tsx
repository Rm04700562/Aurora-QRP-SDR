import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  FlaskConical,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Radio,
  Send,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  decodeBase64ToRgb,
  demodulateSstvAudioToRgb,
  encodeRgbToBase64,
  generateSstvTestPattern,
  getStandardSstvFrequency,
  SSTV_HEIGHT,
  SSTV_MODE_SPECS,
  SSTV_WIDTH,
  synthesizeSstvAudioPcm,
} from '../radio/digitalModes';
import {
  BandId,
  QthLocation,
  RadioMode,
  SstvFramePayload,
  SstvModeId,
} from '../types/radio';

interface SstvRxStats {
  visDetected: boolean;
  syncLocks: number;
  sourceLabel: string;
}

interface SstvModuleProps {
  isPoweredOn: boolean;
  callsign: string;
  qth: QthLocation;
  band: BandId;
  sstvRxFrame: SstvFramePayload | null;
  sstvRxProgress: number;
  sstvRxStats: SstvRxStats | null;
  sstvGallery: SstvFramePayload[];
  isSendingSstv: boolean;
  sstvTxProgress: number;
  onSendSstv: (payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>) => void;
  onLoopbackDecodeSstv: (
    payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>,
    stats: SstvRxStats
  ) => void;
  onSelectRxGalleryItem: (frame: SstvFramePayload) => void;
  onStopDigitalTx: () => void;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
}

type BuiltinPictureId =
  | 'cq'
  | 'bars'
  | 'grid'
  | 'horizon'
  | 'aurora'
  | 'eme'
  | 'alpine'
  | 'shack';

interface CustomPictureItem {
  id: string;
  label: string;
  dataUrl: string;
  imgEl: HTMLImageElement;
}

const SSTV_FORMATS: SstvModeId[] = ['Robot 36', 'Martin M1', 'Scottie S1', 'PD 50'];

const BUILTIN_PICTURES: Array<{ id: BuiltinPictureId; label: string }> = [
  { id: 'cq', label: 'QSL Card' },
  { id: 'horizon', label: 'DX Sunset' },
  { id: 'aurora', label: 'Aurora Sky' },
  { id: 'alpine', label: 'Alpine Summit' },
  { id: 'eme', label: 'Moonbounce' },
  { id: 'shack', label: 'Tower QTH' },
  { id: 'bars', label: 'SMPTE Bars' },
  { id: 'grid', label: 'Reticle' },
];

function drawBuiltinPictureToCtx(
  ctx: CanvasRenderingContext2D,
  id: BuiltinPictureId,
  w = SSTV_WIDTH,
  h = SSTV_HEIGHT
) {
  if (id === 'cq' || id === 'bars' || id === 'grid' || id === 'horizon') {
    const rgb = generateSstvTestPattern(id, w, h);
    const imgData = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < rgb.length; i += 3, p += 4) {
      imgData.data[p] = rgb[i];
      imgData.data[p + 1] = rgb[i + 1];
      imgData.data[p + 2] = rgb[i + 2];
      imgData.data[p + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  if (id === 'aurora') {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#030816');
    sky.addColorStop(0.55, '#09243b');
    sky.addColorStop(1, '#07101f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Aurora curtains
    const curtain = ctx.createLinearGradient(0, 10, w, 58);
    curtain.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    curtain.addColorStop(0.4, 'rgba(52, 211, 153, 0.85)');
    curtain.addColorStop(0.75, 'rgba(56, 189, 248, 0.72)');
    curtain.addColorStop(1, 'rgba(167, 139, 250, 0.5)');
    ctx.fillStyle = curtain;
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.bezierCurveTo(28, 12, 52, 52, 82, 20);
    ctx.bezierCurveTo(100, 8, 114, 34, w, 18);
    ctx.lineTo(w, 56);
    ctx.lineTo(0, 62);
    ctx.closePath();
    ctx.fill();

    // Pine silhouettes
    ctx.fillStyle = '#030712';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, 66);
    for (let x = 0; x <= w; x += 8) {
      ctx.lineTo(x + 4, 58 + ((x * 7) % 10));
      ctx.lineTo(x + 8, 70);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (id === 'alpine') {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    sky.addColorStop(0, '#0c2444');
    sky.addColorStop(1, '#38bdf8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(w * 0.76, h * 0.24, 9, 0, Math.PI * 2);
    ctx.fill();

    // Back ridge
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(24, 42);
    ctx.lineTo(54, 62);
    ctx.lineTo(86, 30);
    ctx.lineTo(w, 58);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Snow caps
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(86, 30);
    ctx.lineTo(75, 42);
    ctx.lineTo(85, 39);
    ctx.lineTo(95, 44);
    ctx.closePath();
    ctx.fill();

    // Foreground meadow
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, h * 0.68, w, h * 0.32);
    return;
  }

  if (id === 'eme') {
    ctx.fillStyle = '#020611';
    ctx.fillRect(0, 0, w, h);
    // Stars
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < 24; i++) {
      ctx.fillRect((i * 29) % w, (i * 17) % (h - 20), 1, 1);
    }
    // Moon
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.34, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(w * 0.67, h * 0.31, 4, 0, Math.PI * 2);
    ctx.arc(w * 0.74, h * 0.39, 3, 0, Math.PI * 2);
    ctx.fill();

    // Earth limb + RF beam arc
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(22, 68);
    ctx.lineTo(w * 0.7, h * 0.34);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(24, h + 18, 36, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 'shack' — Radio tower + twilight sky
  const dusk = ctx.createLinearGradient(0, 0, 0, h);
  dusk.addColorStop(0, '#0f172a');
  dusk.addColorStop(0.55, '#7c2d12');
  dusk.addColorStop(1, '#1e293b');
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h - 18);
  ctx.lineTo(w / 2, 16);
  ctx.lineTo(w / 2 + 8, h - 18);
  ctx.moveTo(w / 2 - 18, 26);
  ctx.lineTo(w / 2 + 18, 26);
  ctx.moveTo(w / 2 - 13, 36);
  ctx.lineTo(w / 2 + 13, 36);
  ctx.stroke();

  // Radiating waves
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  for (let r = 8; r <= 20; r += 6) {
    ctx.beginPath();
    ctx.arc(w / 2, 22, r, -0.7, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, 22, r, Math.PI - 0.7, Math.PI + 0.7);
    ctx.stroke();
  }
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
) {
  if (!srcW || !srcH) {
    ctx.drawImage(source, 0, 0, dstW, dstH);
    return;
  }
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (dstW - drawW) / 2;
  const dy = (dstH - drawH) / 2;
  ctx.drawImage(source, dx, dy, drawW, drawH);
}

const BuiltinThumbCanvas: React.FC<{ id: BuiltinPictureId }> = ({ id }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    drawBuiltinPictureToCtx(ctx, id, 64, 48);
  }, [id]);

  return (
    <canvas
      ref={ref}
      width={64}
      height={48}
      className="w-full h-11 rounded-sm border border-[#24364d] bg-black object-cover"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

const SstvThumbCanvas: React.FC<{ frame: SstvFramePayload }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = frame.width || SSTV_WIDTH;
    const h = frame.height || SSTV_HEIGHT;
    canvas.width = w;
    canvas.height = h;
    const rgb = decodeBase64ToRgb(frame.pixelsBase64, w * h * 3);
    const img = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < rgb.length && p < img.data.length; i += 3, p += 4) {
      img.data[p] = rgb[i];
      img.data[p + 1] = rgb[i + 1];
      img.data[p + 2] = rgb[i + 2];
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame]);

  return (
    <canvas
      ref={ref}
      className="w-10 h-7 rounded-sm border border-[#24364d] bg-black shrink-0"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

export const SstvModule: React.FC<SstvModuleProps> = ({
  isPoweredOn,
  callsign,
  qth,
  band,
  sstvRxFrame,
  sstvRxProgress,
  sstvRxStats,
  sstvGallery,
  isSendingSstv,
  sstvTxProgress,
  onSendSstv,
  onLoopbackDecodeSstv,
  onSelectRxGalleryItem,
  onStopDigitalTx,
  onTuneToFrequency,
}) => {
  const [sstvMode, setSstvMode] = useState<SstvModeId>('Robot 36');
  const [selectedSource, setSelectedSource] = useState<
    { kind: 'builtin'; id: BuiltinPictureId } | { kind: 'custom'; id: string }
  >({ kind: 'builtin', id: 'cq' });
  const [customPictures, setCustomPictures] = useState<CustomPictureItem[]>([]);
  const [showPicturePicker, setShowPicturePicker] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  const [sstvCaption, setSstvCaption] = useState(`${callsign} · ${qth.grid}`);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [capturingCam, setCapturingCam] = useState(false);

  const sstvTxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sstvRxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customRgbRef = useRef<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stdSstvHz = getStandardSstvFrequency(band);
  const modeSpec = SSTV_MODE_SPECS[sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];

  useEffect(() => {
    setSstvCaption(`${callsign} · ${qth.grid}`);
  }, [callsign, qth.grid]);

  const extractCanvasRgb = (canvas: HTMLCanvasElement): Uint8Array => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return new Uint8Array(SSTV_WIDTH * SSTV_HEIGHT * 3);
    const img = ctx.getImageData(0, 0, SSTV_WIDTH, SSTV_HEIGHT);
    const out = new Uint8Array(SSTV_WIDTH * SSTV_HEIGHT * 3);
    for (let i = 0, p = 0; i < out.length; i += 3, p += 4) {
      out[i] = img.data[p];
      out[i + 1] = img.data[p + 1];
      out[i + 2] = img.data[p + 2];
    }
    return out;
  };

  const stampBannerAndCapture = (ctx: CanvasRenderingContext2D, captionText: string) => {
    // Top small VIS mode tag
    ctx.fillStyle = 'rgba(4, 10, 18, 0.72)';
    ctx.fillRect(4, 4, 62, 11);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillText(`${sstvMode.toUpperCase()}`, 7, 12);

    ctx.fillStyle = 'rgba(4, 10, 18, 0.76)';
    ctx.fillRect(4, SSTV_HEIGHT - 26, SSTV_WIDTH - 8, 22);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, SSTV_HEIGHT - 26, SSTV_WIDTH - 8, 22);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(callsign.slice(0, 11), SSTV_WIDTH / 2, SSTV_HEIGHT - 15);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(captionText.slice(0, 18), SSTV_WIDTH / 2, SSTV_HEIGHT - 6);
    ctx.textAlign = 'start';
  };

  // Re-render TX canvas whenever active picture, overlay toggle, caption, mode, or callsign updates
  useEffect(() => {
    const canvas = sstvTxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (selectedSource.kind === 'custom') {
      const found = customPictures.find((p) => p.id === selectedSource.id);
      if (found) {
        drawCoverFit(
          ctx,
          found.imgEl,
          found.imgEl.naturalWidth || SSTV_WIDTH,
          found.imgEl.naturalHeight || SSTV_HEIGHT,
          SSTV_WIDTH,
          SSTV_HEIGHT
        );
      } else {
        drawBuiltinPictureToCtx(ctx, 'cq', SSTV_WIDTH, SSTV_HEIGHT);
      }
    } else {
      drawBuiltinPictureToCtx(ctx, selectedSource.id, SSTV_WIDTH, SSTV_HEIGHT);
    }

    if (showOverlay) {
      stampBannerAndCapture(ctx, sstvCaption);
    }
    customRgbRef.current = extractCanvasRgb(canvas);
  }, [selectedSource, customPictures, showOverlay, sstvCaption, sstvMode, callsign]);

  // Progressive SSTV RX Scanline Raster Renderer
  useEffect(() => {
    const canvas = sstvRxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (!sstvRxFrame) {
      ctx.fillStyle = '#050b14';
      ctx.fillRect(0, 0, SSTV_WIDTH, SSTV_HEIGHT);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.strokeRect(4, 4, SSTV_WIDTH - 8, SSTV_HEIGHT - 8);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RX SCANNER STANDBY', SSTV_WIDTH / 2, SSTV_HEIGHT / 2 - 4);
      ctx.fillStyle = '#475569';
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.fillText('VIS · 1200HZ SYNC · FM', SSTV_WIDTH / 2, SSTV_HEIGHT / 2 + 8);
      ctx.textAlign = 'start';
      return;
    }

    const w = sstvRxFrame.width || SSTV_WIDTH;
    const h = sstvRxFrame.height || SSTV_HEIGHT;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const rgb = decodeBase64ToRgb(sstvRxFrame.pixelsBase64, w * h * 3);
    const imgData = ctx.createImageData(w, h);
    const visibleRows = Math.max(1, Math.round(h * Math.max(0.05, Math.min(1, sstvRxProgress))));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (y * w + x) * 3;
        const dstIdx = (y * w + x) * 4;
        if (y < visibleRows) {
          imgData.data[dstIdx] = rgb[srcIdx];
          imgData.data[dstIdx + 1] = rgb[srcIdx + 1];
          imgData.data[dstIdx + 2] = rgb[srcIdx + 2];
          imgData.data[dstIdx + 3] = 255;
        } else {
          const noise = (x * 37 + y * 19 + visibleRows * 13) % 24;
          imgData.data[dstIdx] = 5 + noise;
          imgData.data[dstIdx + 1] = 11 + noise;
          imgData.data[dstIdx + 2] = 20 + noise;
          imgData.data[dstIdx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    if (visibleRows < h) {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(0, visibleRows, w, 1);
    }
  }, [sstvRxFrame, sstvRxProgress]);

  const loadFilesFromDevice = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCameraNotice(null);

    Array.from(files).forEach((file, idx) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        const img = new window.Image();
        img.onload = () => {
          const picId = `pic-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          const cleanName = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Picture';
          const item: CustomPictureItem = {
            id: picId,
            label: cleanName,
            dataUrl,
            imgEl: img,
          };
          setCustomPictures((prev) => [item, ...prev].slice(0, 16));
          if (idx === 0) {
            setSelectedSource({ kind: 'custom', id: picId });
            setShowPicturePicker(false);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUploadSstvImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    loadFilesFromDevice(e.target.files);
    e.target.value = '';
  };

  const handleDropOnTx = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    loadFilesFromDevice(e.dataTransfer.files);
  };

  const handleWebcamSnap = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNotice('Camera unavailable in this browser');
      return;
    }
    setCapturingCam(true);
    setCameraNotice(null);
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      await video.play();
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = SSTV_WIDTH;
      snapCanvas.height = SSTV_HEIGHT;
      const snapCtx = snapCanvas.getContext('2d');
      if (snapCtx) {
        drawCoverFit(
          snapCtx,
          video,
          video.videoWidth || 320,
          video.videoHeight || 240,
          SSTV_WIDTH,
          SSTV_HEIGHT
        );
        const dataUrl = snapCanvas.toDataURL('image/png');
        const img = new window.Image();
        img.onload = () => {
          const picId = `cam-${Date.now()}`;
          setCustomPictures((prev) =>
            [{ id: picId, label: 'Webcam Snap', dataUrl, imgEl: img }, ...prev].slice(0, 16)
          );
          setSelectedSource({ kind: 'custom', id: picId });
        };
        img.src = dataUrl;
      }
    } catch {
      setCameraNotice('Webcam blocked or not connected');
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setCapturingCam(false);
    }
  };

  const handleUseRxAsTxPicture = () => {
    if (!sstvRxFrame) return;
    const rxCanvas = sstvRxCanvasRef.current;
    if (!rxCanvas) return;
    const dataUrl = rxCanvas.toDataURL('image/png');
    const img = new window.Image();
    img.onload = () => {
      const picId = `rx-${Date.now()}`;
      setCustomPictures((prev) =>
        [{ id: picId, label: `RX ${sstvRxFrame.callsign}`, dataUrl, imgEl: img }, ...prev].slice(
          0,
          16
        )
      );
      setSelectedSource({ kind: 'custom', id: picId });
    };
    img.src = dataUrl;
  };

  const handleTxSstv = () => {
    if (!isPoweredOn || isSendingSstv) return;
    const rgb = customRgbRef.current ?? generateSstvTestPattern('cq', SSTV_WIDTH, SSTV_HEIGHT);
    const pixelsBase64 = encodeRgbToBase64(rgb);
    onSendSstv({
      callsign,
      sstvMode,
      width: SSTV_WIDTH,
      height: SSTV_HEIGHT,
      pixelsBase64,
      caption: sstvCaption,
    });
  };

  const handleLoopbackDecode = () => {
    if (!isPoweredOn) return;
    const rgb = customRgbRef.current ?? generateSstvTestPattern('cq', SSTV_WIDTH, SSTV_HEIGHT);
    const pcm = synthesizeSstvAudioPcm(rgb, SSTV_WIDTH, SSTV_HEIGHT, sstvMode, 24000, 5);
    const demod = demodulateSstvAudioToRgb(pcm, SSTV_WIDTH, SSTV_HEIGHT, sstvMode, 24000, 5);
    const pixelsBase64 = encodeRgbToBase64(demod.rgb);
    onLoopbackDecodeSstv(
      {
        callsign,
        sstvMode,
        width: SSTV_WIDTH,
        height: SSTV_HEIGHT,
        pixelsBase64,
        caption: `${sstvCaption} · FM DSP`,
      },
      {
        visDetected: demod.visDetected,
        syncLocks: demod.syncLockCount,
        sourceLabel: 'Audio FM Loopback',
      }
    );
  };

  const handleDownloadRxPng = () => {
    const canvas = sstvRxCanvasRef.current;
    if (!canvas || !sstvRxFrame) return;
    const link = document.createElement('a');
    link.download = `sstv-${sstvRxFrame.callsign}-${sstvRxFrame.sstvMode.replace(/\s+/g, '')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const activePictureLabel =
    selectedSource.kind === 'custom'
      ? customPictures.find((p) => p.id === selectedSource.id)?.label ?? 'Custom Photo'
      : BUILTIN_PICTURES.find((b) => b.id === selectedSource.id)?.label ?? 'QSL Card';

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0 relative" data-testid="module-panel-sstv">
      {/* Hidden multi-file input for browsing local Pictures folder */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="sstv-upload-input"
        onChange={handleUploadSstvImages}
        className="hidden"
      />

      {/* Top Format + Picture Selector + DSP Loopback + TX Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono-tabular">
        <div className="flex flex-wrap items-center gap-1">
          <select
            aria-label="SSTV Format"
            data-testid="sstv-mode-select"
            value={sstvMode}
            onChange={(e) => setSstvMode(e.target.value as SstvModeId)}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-sky-300 cursor-pointer"
          >
            {SSTV_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>

          <button
            type="button"
            data-testid="sstv-pictures-picker-button"
            onClick={() => setShowPicturePicker((p) => !p)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer ${
              showPicturePicker
                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                : 'bg-[#0a1019] border-[#24364d] hover:border-sky-400 text-slate-200'
            }`}
            title="Choose from built-in scenes or your saved Pictures"
          >
            <Images className="w-2.5 h-2.5 text-sky-300" />
            <span>Pictures: {activePictureLabel}</span>
          </button>

          <button
            type="button"
            data-testid="sstv-browse-pictures-button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 text-amber-200 cursor-pointer"
            title="Browse images from your device Pictures / Photos folder"
          >
            <FolderOpen className="w-2.5 h-2.5" />
            <span>From Pictures</span>
          </button>

          <button
            type="button"
            disabled={!isPoweredOn || capturingCam}
            onClick={() => void handleWebcamSnap()}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-slate-300 cursor-pointer disabled:opacity-40"
            title="Capture snapshot from webcam onto TX Frame"
          >
            <Camera className="w-2.5 h-2.5" />
            <span>{capturingCam ? 'Cam...' : 'Cam'}</span>
          </button>

          <button
            type="button"
            data-testid="sstv-qsy-button"
            onClick={() => onTuneToFrequency(stdSstvHz, 'SSTV')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer"
          >
            <Radio className="w-2.5 h-2.5" />
            <span>QSY {(stdSstvHz / 1_000_000).toFixed(3)}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <input
            type="text"
            value={sstvCaption}
            onChange={(e) => setSstvCaption(e.target.value.slice(0, 24))}
            aria-label="SSTV Caption"
            placeholder="Caption"
            className="w-24 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#060b12] text-slate-200"
          />

          <button
            type="button"
            data-testid="sstv-overlay-toggle"
            aria-pressed={showOverlay}
            onClick={() => setShowOverlay((v) => !v)}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border cursor-pointer ${
              showOverlay
                ? 'bg-sky-500/20 border-sky-400/70 text-sky-200'
                : 'bg-[#0a1019] border-[#24364d] text-slate-400'
            }`}
            title="Toggle Callsign/Caption text overlay on picture"
          >
            <Tag className="w-2.5 h-2.5" />
            <span>Label</span>
          </button>

          <button
            type="button"
            disabled={!isPoweredOn}
            data-testid="sstv-loopback-button"
            onClick={handleLoopbackDecode}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 text-emerald-200 cursor-pointer disabled:opacity-40"
            title="Synthesize VIS + 1200 Hz sync + FM pixel tones and demodulate scanlines locally"
          >
            <FlaskConical className="w-2.5 h-2.5" />
            <span>Loopback</span>
          </button>

          {isSendingSstv ? (
            <button
              type="button"
              onClick={onStopDigitalTx}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white font-display font-bold text-[10.5px] uppercase cursor-pointer whitespace-nowrap shrink-0"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop ({Math.round(sstvTxProgress * 100)}%)</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!isPoweredOn}
              onClick={handleTxSstv}
              data-testid="sstv-send-button"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/70 hover:bg-sky-500 hover:text-slate-950 text-sky-200 font-display font-bold text-[10.5px] uppercase cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
              <span>TX SSTV</span>
            </button>
          )}
        </div>
      </div>

      {cameraNotice && (
        <div className="text-[10px] font-mono-tabular text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
          {cameraNotice}
        </div>
      )}

      {/* Expandable Picture Chooser Drawer (Device Pictures + Built-In Gallery) */}
      {showPicturePicker ? (
        <div
          className="rounded border border-sky-500/40 bg-[#050b13] p-2 flex flex-col gap-2 max-h-[195px] overflow-y-auto"
          data-testid="sstv-picture-picker-panel"
        >
          <div className="flex items-center justify-between text-[10px] font-mono-tabular">
            <span className="text-sky-300 font-semibold flex items-center gap-1">
              <Images className="w-3 h-3" /> Choose SSTV Picture
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-200 hover:bg-amber-500 hover:text-slate-950 cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Add from Pictures...</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPicturePicker(false)}
                className="p-0.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
                aria-label="Close Picture Chooser"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {customPictures.length > 0 && (
            <div>
              <div className="text-[9px] font-mono-tabular text-amber-300 uppercase mb-1">
                My Pictures ({customPictures.length})
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {customPictures.map((pic) => {
                  const isSel = selectedSource.kind === 'custom' && selectedSource.id === pic.id;
                  return (
                    <div
                      key={pic.id}
                      className={`relative rounded border p-1 flex flex-col gap-0.5 cursor-pointer ${
                        isSel
                          ? 'border-sky-400 bg-sky-500/20'
                          : 'border-[#213248] bg-[#08101a] hover:border-sky-400/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSource({ kind: 'custom', id: pic.id });
                          setShowPicturePicker(false);
                        }}
                        className="w-full text-left cursor-pointer"
                      >
                        <img
                          src={pic.dataUrl}
                          alt={pic.label}
                          className="w-full h-11 object-cover rounded-sm border border-[#24364d]"
                        />
                        <div className="text-[8.5px] font-mono-tabular text-slate-200 truncate mt-0.5 flex items-center justify-between">
                          <span className="truncate">{pic.label}</span>
                          {isSel && <Check className="w-2.5 h-2.5 text-sky-300 shrink-0" />}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${pic.label}`}
                        onClick={() => {
                          setCustomPictures((prev) => prev.filter((x) => x.id !== pic.id));
                          if (isSel) setSelectedSource({ kind: 'builtin', id: 'cq' });
                        }}
                        className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-slate-300 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-[9px] font-mono-tabular text-slate-400 uppercase mb-1">
              Gallery Presets (Click to Load)
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {BUILTIN_PICTURES.map((preset) => {
                const isSel = selectedSource.kind === 'builtin' && selectedSource.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`sstv-preset-${preset.id}`}
                    onClick={() => {
                      setSelectedSource({ kind: 'builtin', id: preset.id });
                      setShowPicturePicker(false);
                    }}
                    className={`rounded border p-1 text-left cursor-pointer ${
                      isSel
                        ? 'border-sky-400 bg-sky-500/20'
                        : 'border-[#213248] bg-[#08101a] hover:border-sky-400/60'
                    }`}
                  >
                    <BuiltinThumbCanvas id={preset.id} />
                    <div className="text-[8.5px] font-mono-tabular text-slate-200 truncate mt-0.5 flex items-center justify-between">
                      <span>{preset.label}</span>
                      {isSel && <Check className="w-2.5 h-2.5 text-sky-300 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Dual TX / RX Frame Monitors */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 flex-1 min-h-0">
          {/* TX Composer Frame (Supports Drag & Drop from Pictures) */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDropOnTx}
            className={`rounded border p-1.5 flex flex-col items-center justify-between gap-1 transition-colors ${
              isDragOver
                ? 'border-amber-400 bg-amber-500/10'
                : 'border-[#1c2c40] bg-[#050a11]'
            }`}
          >
            <div className="w-full flex items-center justify-between text-[9.5px] font-mono-tabular text-slate-400">
              <span className="flex items-center gap-1 text-sky-300 font-semibold truncate">
                <ImageIcon className="w-3 h-3 shrink-0" /> TX · {activePictureLabel}
              </span>
              <span className="shrink-0">VIS {modeSpec.visCode} · {SSTV_WIDTH}×{SSTV_HEIGHT}</span>
            </div>
            <canvas
              ref={sstvTxCanvasRef}
              width={SSTV_WIDTH}
              height={SSTV_HEIGHT}
              data-testid="sstv-tx-canvas"
              onClick={() => fileInputRef.current?.click()}
              title="Click to choose an image from Pictures or drag-and-drop an image here"
              className="w-[136px] h-[94px] rounded border border-[#24364d] bg-black cursor-pointer"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="w-full text-[9px] font-mono-tabular text-slate-400 flex justify-between">
              <span>{modeSpec.channelOrder} · Drop or click image</span>
              <span>{(modeSpec.txSweepMs / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {/* RX Demodulator Monitor */}
          <div className="rounded border border-[#1c2c40] bg-[#050a11] p-1.5 flex flex-col items-center justify-between gap-1">
            <div className="w-full flex items-center justify-between gap-1 text-[9.5px] font-mono-tabular text-slate-400">
              <span className="text-emerald-300 font-semibold truncate">
                RX {sstvRxFrame ? `· ${sstvRxFrame.callsign}` : 'Scan'}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {sstvRxStats && (
                  <span
                    data-testid="sstv-rx-lock-badge"
                    className="px-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-[8.5px]"
                  >
                    {sstvRxStats.visDetected ? 'VIS' : 'AUTO'} · {sstvRxStats.syncLocks}/{SSTV_HEIGHT} SYNC
                  </span>
                )}
                <span>{sstvRxFrame ? `${Math.round(sstvRxProgress * 100)}%` : 'Idle'}</span>
                {sstvRxFrame && sstvRxProgress >= 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handleUseRxAsTxPicture}
                      data-testid="sstv-use-rx-tx-button"
                      className="px-1 py-0.5 rounded border border-[#24364d] hover:border-sky-400 text-[8.5px] text-amber-300 cursor-pointer"
                      title="Use this decoded RX image as your TX picture"
                    >
                      →TX
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadRxPng}
                      data-testid="sstv-download-button"
                      className="p-0.5 rounded border border-[#24364d] hover:border-sky-400 text-sky-300 cursor-pointer"
                      title="Download decoded RX frame as PNG"
                    >
                      <Download className="w-2.5 h-2.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <canvas
              ref={sstvRxCanvasRef}
              width={SSTV_WIDTH}
              height={SSTV_HEIGHT}
              data-testid="sstv-rx-canvas"
              className="w-[136px] h-[94px] rounded border border-[#24364d] bg-black"
              style={{ imageRendering: 'pixelated' }}
            />

            <div className="w-full text-[9px] font-mono-tabular text-slate-400 flex justify-between truncate">
              <span>1900 VIS · 1200 SYNC</span>
              <span className="text-slate-300 truncate">
                {sstvRxFrame ? sstvRxFrame.caption || sstvRxFrame.sstvMode : '1500–2300 Hz FM'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Compact Picture + RX Gallery Strip */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto rounded border border-[#1a283b] bg-[#04080e] px-1.5 py-1 min-h-[36px]"
        data-testid="sstv-rx-gallery"
      >
        <span className="text-[9px] font-mono-tabular text-slate-400 uppercase shrink-0">
          {customPictures.length > 0 ? `Pictures (${customPictures.length}) / ` : ''}RX ({sstvGallery.length}):
        </span>

        {/* Loaded device picture quick switcher */}
        {customPictures.map((pic) => {
          const isSel = selectedSource.kind === 'custom' && selectedSource.id === pic.id;
          return (
            <button
              key={pic.id}
              type="button"
              onClick={() => {
                setSelectedSource({ kind: 'custom', id: pic.id });
                setShowPicturePicker(false);
              }}
              className={`flex items-center gap-1 px-1 py-0.5 rounded border text-left cursor-pointer shrink-0 ${
                isSel
                  ? 'border-amber-400 bg-amber-500/15'
                  : 'border-[#213248] bg-[#09101a] hover:border-amber-400/50'
              }`}
              title={`Select TX picture: ${pic.label}`}
            >
              <img
                src={pic.dataUrl}
                alt={pic.label}
                className="w-8 h-6 rounded-sm border border-[#24364d] object-cover shrink-0"
              />
              <div className="flex flex-col text-[8.5px] font-mono-tabular leading-tight max-w-[64px]">
                <span className="text-amber-300 font-bold truncate">{pic.label}</span>
                <span className="text-slate-400">TX Pic</span>
              </div>
            </button>
          );
        })}

        {sstvGallery.length === 0 && customPictures.length === 0 ? (
          <span className="text-[9.5px] font-mono-tabular text-slate-500">
            Click From Pictures to pick photos, or Pictures to browse scenes.
          </span>
        ) : (
          sstvGallery.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectRxGalleryItem(item)}
              className={`flex items-center gap-1 px-1 py-0.5 rounded border text-left cursor-pointer shrink-0 ${
                sstvRxFrame?.id === item.id
                  ? 'border-sky-400 bg-sky-500/15'
                  : 'border-[#213248] bg-[#09101a] hover:border-sky-400/50'
              }`}
            >
              <SstvThumbCanvas frame={item} />
              <div className="flex flex-col text-[8.5px] font-mono-tabular leading-tight">
                <span className="text-sky-300 font-bold">{item.callsign}</span>
                <span className="text-slate-400">{item.sstvMode}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
