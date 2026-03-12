import React, { useEffect, useEffectEvent, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { Camera, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, RotateCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QR_READER_OPTIONS = {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported: true
};

const MotionDiv = motion.div;

const CAMERA_LABEL_HINTS = {
    macro: ['macro'],
    rear: ['back', 'rear', 'traseira', 'environment', 'externa', 'wide', 'ultra', 'tele'],
    front: ['front', 'frontal', 'user', 'selfie']
};

const createQrCodeReader = (elementId) => new Html5Qrcode(elementId, QR_READER_OPTIONS);

const stopMediaStream = (stream) => {
    if (!stream) return;

    stream.getTracks().forEach((track) => {
        track.stop();
    });
};

const cameraLabelIncludes = (label, hints) => {
    const normalizedLabel = (label || '').toLowerCase();
    return hints.some((hint) => normalizedLabel.includes(hint));
};

const isMacroCamera = (label) => cameraLabelIncludes(label, CAMERA_LABEL_HINTS.macro);
const isRearCamera = (label) => cameraLabelIncludes(label, CAMERA_LABEL_HINTS.rear);
const isFrontCamera = (label) => cameraLabelIncludes(label, CAMERA_LABEL_HINTS.front);

const getCameraPriority = (label) => {
    if (isMacroCamera(label)) return 0;
    if (isRearCamera(label)) return 1;
    if (isFrontCamera(label)) return 3;
    return 2;
};

const normalizeCameras = (devices = []) => (
    devices
        .filter((device) => device?.id)
        .map((device, index) => ({
            ...device,
            label: device.label?.trim() || `Câmera ${index + 1}`
        }))
        .sort((cameraA, cameraB) => {
            const priorityDifference = getCameraPriority(cameraA.label) - getCameraPriority(cameraB.label);
            if (priorityDifference !== 0) return priorityDifference;
            return cameraA.label.localeCompare(cameraB.label, 'pt-BR');
        })
);

const getPreferredCameraId = (devices) => (
    devices.find((device) => isMacroCamera(device.label))?.id
    || devices.find((device) => isRearCamera(device.label))?.id
    || devices[0]?.id
    || ''
);

const loadImageFromFile = (file) => (
    new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        const cleanup = () => URL.revokeObjectURL(objectUrl);

        image.onload = () => {
            cleanup();
            resolve(image);
        };

        image.onerror = () => {
            cleanup();
            reject(new Error('Falha ao carregar a imagem selecionada.'));
        };

        image.src = objectUrl;
    })
);

const canvasToFile = (canvas, fileName) => (
    new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Falha ao preparar a imagem para leitura.'));
                return;
            }

            resolve(new File([blob], fileName, { type: 'image/png' }));
        }, 'image/png');
    })
);

const createImageVariantCanvas = (
    image,
    {
        rotation = 0,
        maxDimension = 2200,
        minDimension = 1000,
        contrast = 1,
        grayscale = false
    } = {}
) => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const maxSourceDimension = Math.max(sourceWidth, sourceHeight);
    let scale = 1;

    if (maxDimension && maxSourceDimension > maxDimension) {
        scale = maxDimension / maxSourceDimension;
    } else if (minDimension && maxSourceDimension < minDimension) {
        scale = minDimension / maxSourceDimension;
    }

    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    const isQuarterTurn = Math.abs(rotation) % 180 !== 0;

    const canvas = document.createElement('canvas');
    canvas.width = isQuarterTurn ? drawHeight : drawWidth;
    canvas.height = isQuarterTurn ? drawWidth : drawHeight;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        throw new Error('Falha ao preparar a imagem para leitura.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.filter = `${grayscale ? 'grayscale(1)' : 'grayscale(0)'} contrast(${contrast})`;
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.filter = 'none';

    return canvas;
};

const tryDecodeWithNativeDetector = async (imageSource) => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
        return null;
    }

    try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(imageSource);
        return results.find((result) => result.rawValue)?.rawValue || null;
    } catch (error) {
        console.debug('BarcodeDetector indisponível para esta imagem:', error);
        return null;
    }
};

const tryDecodeWithHtml5Qrcode = async (reader, file) => {
    const result = await reader.scanFileV2(file, false);
    return result.decodedText;
};

const createVariantFileName = (originalName, suffix) => {
    const extensionIndex = originalName.lastIndexOf('.');
    const baseName = extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName;
    return `${baseName}-${suffix}.png`;
};

const decodeQrFromImageFile = async (file) => {
    const reader = createQrCodeReader('reader-hidden');

    try {
        return await tryDecodeWithHtml5Qrcode(reader, file);
    } catch (initialError) {
        const image = await loadImageFromFile(file);
        const variants = [
            {
                source: createImageVariantCanvas(image, { rotation: 0 }),
                suffix: 'normalized'
            },
            {
                source: createImageVariantCanvas(image, { rotation: 0, contrast: 1.45, grayscale: true, minDimension: 1400 }),
                suffix: 'enhanced'
            },
            {
                source: createImageVariantCanvas(image, { rotation: 90 }),
                suffix: 'rotated-90'
            },
            {
                source: createImageVariantCanvas(image, { rotation: 180 }),
                suffix: 'rotated-180'
            },
            {
                source: createImageVariantCanvas(image, { rotation: 270 }),
                suffix: 'rotated-270'
            }
        ];

        for (const variant of variants) {
            const nativeResult = await tryDecodeWithNativeDetector(variant.source);
            if (nativeResult) {
                return nativeResult;
            }

            const variantFile = await canvasToFile(
                variant.source,
                createVariantFileName(file.name, variant.suffix)
            );

            try {
                return await tryDecodeWithHtml5Qrcode(reader, variantFile);
            } catch {
                // Continua para a próxima variação da mesma imagem.
            }
        }

        throw initialError;
    } finally {
        try {
            reader.clear();
        } catch {
            // O reader-hidden pode já estar limpo.
        }
    }
};

const optimizeActiveCamera = async (scanner, cameraLabel) => {
    try {
        const capabilities = scanner.getRunningTrackCapabilities();
        const advanced = [];

        if (Array.isArray(capabilities.focusMode)) {
            if (capabilities.focusMode.includes('continuous')) {
                advanced.push({ focusMode: 'continuous' });
            } else if (capabilities.focusMode.includes('single-shot')) {
                advanced.push({ focusMode: 'single-shot' });
            }
        }

        if (!isMacroCamera(cameraLabel) && capabilities.zoom?.max > 1) {
            const minZoom = capabilities.zoom.min || 1;
            const targetZoom = Math.min(capabilities.zoom.max, Math.max(minZoom, 2));
            advanced.push({ zoom: targetZoom });
        }

        if (advanced.length > 0) {
            await scanner.applyVideoConstraints({ advanced });
        }
    } catch (error) {
        console.debug('Não foi possível aplicar otimizações de foco/zoom nesta câmera:', error);
    }
};

const createBaseScanConfig = () => ({
    fps: 12,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.floor(minEdge * 0.85);
        return { width: size, height: size };
    },
    disableFlip: false
});

const createPreferredVideoConstraints = (cameraId) => ({
    deviceId: { exact: cameraId },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15 }
});

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, success, partial, error
    const [errorMessage, setErrorMessage] = useState('');
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);

    const loadCameras = async () => {
        try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            stopMediaStream(permissionStream);

            let devices = [];
            if (navigator.mediaDevices?.enumerateDevices) {
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                devices = allDevices
                    .filter((device) => device.kind === 'videoinput')
                    .map((device) => ({
                        id: device.deviceId,
                        label: device.label
                    }));
            }

            if (!devices.length) {
                devices = await Html5Qrcode.getCameras();
            }

            const availableCameras = normalizeCameras(devices);
            setCameras(availableCameras);
            setSelectedCameraId((currentCameraId) => (
                availableCameras.some((camera) => camera.id === currentCameraId)
                    ? currentCameraId
                    : getPreferredCameraId(availableCameras)
            ));
        } catch (err) {
            console.error('Erro ao buscar câmeras:', err);
            // Não trava o fluxo aqui, pois o usuário ainda pode usar imagem.
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
            } catch (error) {
                console.error('Erro ao parar scanner:', error);
            }

            try {
                scannerRef.current.clear();
            } catch {
                // O reader pode já estar limpo.
            }

            scannerRef.current = null;
        }
    };

    const handleQRCodeDecoded = async (url) => {
        setStatus('processing');
        setErrorMessage('');
        try {
            const data = await processNFCeURL(url);

            if (data.isPartial) {
                console.warn('Importacao parcial detectada:', data.partialReasons || []);
                setStatus('partial');
                setErrorMessage(data.partialMessage || 'A consulta retornou dados incompletos. Nenhum dado foi salvo. Tente novamente.');
                return;
            }

            if (data.accessKey) {
                const existing = await db.receipts.where('accessKey').equals(data.accessKey).first();
                if (existing) {
                    if (!existing.isPartial) {
                        setStatus('error');
                    setErrorMessage('Este cupom fiscal já está cadastrado.');
                        return;
                    }

                    await db.transaction('rw', db.receipts, db.products, async () => {
                        await db.products.where('receiptId').equals(existing.id).delete();
                        await db.receipts.delete(existing.id);
                    });
                }
            }

            const receiptId = await db.receipts.add({
                establishment: data.establishment,
                date: data.date,
                totalValue: data.totalValue,
                url,
                accessKey: data.accessKey,
                receiptNumber: data.receiptNumber,
                paymentMethod: data.paymentMethod,
                isPartial: data.isPartial
            });

            if (data.products && data.products.length > 0) {
                const productsWithIds = data.products.map((product) => ({
                    ...product,
                    receiptId,
                    paymentMethod: data.paymentMethod,
                    category: autoCategorize(product.name)
                }));
                await db.products.bulkAdd(productsWithIds);
            }

            setStatus('success');
            setTimeout(() => onComplete(), 2000);
        } catch (err) {
            console.error('Erro no robô:', err);
            setStatus('error');
            setErrorMessage('Falha ao obter dados da SEFAZ. Verifique sua conexão.');
        }
    };

    const handleScanSuccess = useEffectEvent(async (decodedText) => {
        await stopScanner();
        await handleQRCodeDecoded(decodedText);
    });

    useEffect(() => {
        loadCameras();
        return () => stopScanner();
    }, []);

    useEffect(() => {
        if (status !== 'scanning' || !selectedCameraId) {
            return undefined;
        }

        let cancelled = false;

        const start = async () => {
            try {
                await new Promise((resolve) => setTimeout(resolve, 400));

                const element = document.getElementById('reader');
                if (!element) {
                    throw new Error('Elemento do scanner não encontrado no DOM');
                }

                const newScanner = createQrCodeReader('reader');
                scannerRef.current = newScanner;

                const onDecode = async (decodedText) => {
                    if (cancelled) return;
                    await handleScanSuccess(decodedText);
                };

                const baseScanConfig = createBaseScanConfig();

                try {
                    await newScanner.start(
                        selectedCameraId,
                        {
                            ...baseScanConfig,
                            videoConstraints: createPreferredVideoConstraints(selectedCameraId)
                        },
                        onDecode,
                        () => { } // Ignora erros de leitura de frame.
                    );
                } catch (preferredStartError) {
                    console.warn('Falha ao iniciar com constraints avançados; tentando abertura padrão da câmera.', preferredStartError);
                    await newScanner.start(
                        selectedCameraId,
                        baseScanConfig,
                        onDecode,
                        () => { } // Ignora erros de leitura de frame.
                    );
                }

                const currentCamera = cameras.find((camera) => camera.id === selectedCameraId);
                await optimizeActiveCamera(newScanner, currentCamera?.label || '');
            } catch (err) {
                if (cancelled) return;

                console.error('Erro ao iniciar câmera:', err);
                setStatus('error');
                setErrorMessage('Falha ao acessar esta câmera. Tente outra disponível no aparelho ou verifique se ela não está em uso por outro app.');
                stopScanner();
            }
        };

        start();

        return () => {
            cancelled = true;
        };
    }, [status, selectedCameraId, cameras]);

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStatus('processing');
        setErrorMessage('');

        try {
            const decodedText = await decodeQrFromImageFile(file);
            await handleQRCodeDecoded(decodedText);
        } catch (err) {
            console.error('Erro na leitura do arquivo:', err);
            setStatus('error');
            setErrorMessage('Não foi possível localizar um QR Code legível nesta imagem. Tente outra foto mais nítida ou uma imagem em melhor resolução.');
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="animate-slide-up">
            <div
                id="reader-hidden"
                style={{
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden',
                    opacity: 0,
                    pointerEvents: 'none'
                }}
            ></div>

            <div className="glass-card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '15px' }}>Leitor NFC-e</h3>

                <AnimatePresence mode="wait">
                    {status === 'idle' && (
                        <MotionDiv key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '25px' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>
                                    Lente Selecionada (macro, traseira, frontal ou qualquer outra disponível)
                                </label>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                                    <select
                                        className="glass-card"
                                        style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'white', border: '1px solid #ddd' }}
                                        value={selectedCameraId}
                                        onChange={(e) => setSelectedCameraId(e.target.value)}
                                    >
                                        {cameras.length > 0 ? (
                                            cameras.map((camera) => (
                                                <option key={camera.id} value={camera.id}>{camera.label}</option>
                                            ))
                                        ) : (
                                            <option value="">Detectando câmeras...</option>
                                        )}
                                    </select>
                                    <button
                                        onClick={loadCameras}
                                        className="btn-primary"
                                        style={{ width: '50px', padding: 0, background: '#eee' }}
                                    >
                                        <RotateCw size={20} color="var(--primary-blue)" />
                                    </button>
                                </div>
                                <button className="btn-primary" onClick={() => setStatus('scanning')}>
                                    <Camera size={20} /> Abrir Câmera
                                </button>
                            </div>

                            <div style={{ padding: '20px 0', borderTop: '1px solid #eee' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>
                                    Ou use um arquivo de imagem
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                />
                                <button
                                    className="btn-primary"
                                    style={{ background: 'white', color: 'var(--primary-blue)', border: '1px solid #ddd' }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <ImageIcon size={20} /> Carregar QR Code
                                </button>
                            </div>
                        </MotionDiv>
                    )}

                    {(status === 'scanning' || status === 'processing') && (
                        <MotionDiv key="loading" style={{ padding: '10px' }}>
                            {status === 'scanning' && (
                                <div id="reader" style={{ width: '100%', minHeight: '300px', borderRadius: '20px', overflow: 'hidden', background: '#000' }}></div>
                            )}
                            <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <Loader2 className="animate-spin" size={40} color="var(--primary-blue)" />
                                <p style={{ fontWeight: '600' }}>
                                    {status === 'scanning' ? 'Aguardando QR Code...' : 'Processando dados da nota...'}
                                </p>
                                <button
                                    onClick={async () => { await stopScanner(); setStatus('idle'); }}
                                    className="btn-primary"
                                    style={{ background: '#fefefe', color: '#ff5252', width: 'auto', padding: '10px 25px' }}
                                >
                                    <X size={18} /> Cancelar
                                </button>
                            </div>
                        </MotionDiv>
                    )}

                    {status === 'success' && (
                        <MotionDiv key="success" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <CheckCircle2 size={64} color="var(--success-emerald)" style={{ margin: '0 auto 20px' }} />
                            <h3 style={{ color: 'var(--success-emerald)' }}>Importado com Sucesso!</h3>
                        </MotionDiv>
                    )}

                    {status === 'partial' && (
                        <MotionDiv key="partial" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <AlertCircle size={64} color="#FF9800" style={{ margin: '0 auto 20px' }} />
                            <h4 style={{ color: '#FF9800', marginBottom: '10px' }}>Importacao incompleta</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '10px' }}>{errorMessage}</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '20px' }}>
                                Nenhum dado foi salvo nesta tentativa.
                            </p>
                            <button className="btn-primary" onClick={() => { setStatus('idle'); stopScanner(); }}>Tentar Novamente</button>
                        </MotionDiv>
                    )}

                    {status === 'error' && (
                        <MotionDiv key="error" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <AlertCircle size={64} color="#f44336" style={{ margin: '0 auto 20px' }} />
                            <h4 style={{ color: '#f44336', marginBottom: '10px' }}>Ops! Erro na leitura</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '20px' }}>{errorMessage}</p>
                            <button className="btn-primary" onClick={() => { setStatus('idle'); stopScanner(); }}>Tentar Novamente</button>
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
