import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { BrowserMultiFormatReader } from '@zxing/library';
import { AlertCircle, Camera, CheckCircle2, Image as ImageIcon, Loader2, QrCode, Save, X } from 'lucide-react';
import { db } from '../db';
import { PAYMENT_METHOD_NOT_INFORMED } from '../utils/paymentMethods';
import { autoCategorize, processNFCeURL } from '../utils/scraper';
import { buildPixExpenseIdentityKey, PIX_EXPENSE_CATEGORY_OPTIONS, processarQRCode } from '../utils/qrCode';
import { toInputDateValue, toStoredDateTime } from '../utils/date';

const QR_READER_OPTIONS = {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported: true
};

const DEFAULT_CATEGORY_COLOR = '#607D8B';

const parseCurrencyInput = (value) => {
    if (!value) return 0;
    
    let normalized = String(value).trim().replace(/[^\d.,-]/g, '');
    
    if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
        normalized = normalized.replace(',', '.');
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
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
});

const canvasToFile = (canvas, fileName) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (!blob) {
            reject(new Error('Falha ao preparar a imagem para leitura.'));
            return;
        }

        resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
});

const createImageVariantCanvas = (image, options = {}) => {
    const {
        rotation = 0,
        contrast = 1,
        grayscale = false,
        brightness = 1,
        threshold = null,
        paddingRatio = 0,
        crop = null,
        minDimension = 1200,
        maxDimension = 2200
    } = options;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const cropX = crop ? Math.max(0, Math.round(sourceWidth * (crop.x || 0))) : 0;
    const cropY = crop ? Math.max(0, Math.round(sourceHeight * (crop.y || 0))) : 0;
    const cropWidth = crop ? Math.max(1, Math.round(sourceWidth * Math.min(1, Math.max(0.01, crop.width || 1)))) : sourceWidth;
    const cropHeight = crop ? Math.max(1, Math.round(sourceHeight * Math.min(1, Math.max(0.01, crop.height || 1)))) : sourceHeight;
    const safeCropWidth = Math.max(1, Math.min(cropWidth, sourceWidth - cropX));
    const safeCropHeight = Math.max(1, Math.min(cropHeight, sourceHeight - cropY));
    const maxSourceDimension = Math.max(safeCropWidth, safeCropHeight);
    let scale = 1;

    if (maxSourceDimension > maxDimension) scale = maxDimension / maxSourceDimension;
    else if (maxSourceDimension < minDimension) scale = minDimension / maxSourceDimension;

    const drawWidth = Math.max(1, Math.round(safeCropWidth * scale));
    const drawHeight = Math.max(1, Math.round(safeCropHeight * scale));
    const isQuarterTurn = Math.abs(rotation) % 180 !== 0;
    const contentWidth = isQuarterTurn ? drawHeight : drawWidth;
    const contentHeight = isQuarterTurn ? drawWidth : drawHeight;
    const paddingX = Math.round(contentWidth * paddingRatio);
    const paddingY = Math.round(contentHeight * paddingRatio);

    const canvas = document.createElement('canvas');
    canvas.width = contentWidth + (paddingX * 2);
    canvas.height = contentHeight + (paddingY * 2);

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Falha ao preparar a imagem para leitura.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.filter = `${grayscale ? 'grayscale(1)' : 'grayscale(0)'} contrast(${contrast}) brightness(${brightness})`;
    context.drawImage(image, cropX, cropY, safeCropWidth, safeCropHeight, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = 'none';

    if (Number.isFinite(threshold)) {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        for (let index = 0; index < data.length; index += 4) {
            const luminance = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
            const value = luminance >= threshold ? 255 : 0;
            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            data[index + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
    }

    return canvas;
};

const tryDecodeWithNativeDetector = async (imageSource) => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
    try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(imageSource);
        return results.find((result) => result.rawValue)?.rawValue || null;
    } catch {
        return null;
    }
};

const tryDecodeWithHtml5Qrcode = async (reader, file) => {
    try {
        const result = await reader.scanFileV2(file, false);
        return result.decodedText;
    } catch (error) {
        if (typeof reader.scanFile === 'function') return reader.scanFile(file, false);
        throw error;
    }
};

const decodeQrFromImageFile = async (file) => {
    const reader = createQrCodeReader('reader-hidden');

    try {
        return await tryDecodeWithHtml5Qrcode(reader, file);
    } catch (initialError) {
        const image = await loadImageFromFile(file);
        const directNative = await tryDecodeWithNativeDetector(image);
        if (directNative) return directNative;

        const variants = [
            createImageVariantCanvas(image, { paddingRatio: 0.06 }),
            createImageVariantCanvas(image, { contrast: 1.45, grayscale: true, paddingRatio: 0.08, minDimension: 1400 }),
            createImageVariantCanvas(image, { contrast: 1.9, grayscale: true, brightness: 1.06, threshold: 172, paddingRatio: 0.12, minDimension: 2000 }),
            createImageVariantCanvas(image, { contrast: 2.05, grayscale: true, threshold: 150, paddingRatio: 0.12, minDimension: 2000 }),
            // Faturas como energia costumam trazer um QR Pix menor na metade superior.
            createImageVariantCanvas(image, { contrast: 1.72, grayscale: true, paddingRatio: 0.14, crop: { x: 0.46, y: 0.18, width: 0.28, height: 0.22 }, minDimension: 2200 }),
            createImageVariantCanvas(image, { contrast: 1.9, grayscale: true, threshold: 162, paddingRatio: 0.16, crop: { x: 0.44, y: 0.16, width: 0.32, height: 0.26 }, minDimension: 2400 }),
            createImageVariantCanvas(image, { contrast: 1.76, grayscale: true, paddingRatio: 0.16, crop: { x: 0.4, y: 0.14, width: 0.4, height: 0.32 }, minDimension: 2300 }),
            createImageVariantCanvas(image, { contrast: 1.6, grayscale: true, paddingRatio: 0.12, crop: { x: 0, y: 0.1, width: 1, height: 0.9 }, minDimension: 1700 }),
            createImageVariantCanvas(image, { contrast: 1.65, grayscale: true, paddingRatio: 0.12, crop: { x: 0, y: 0.42, width: 1, height: 0.58 }, minDimension: 1700 }),
            createImageVariantCanvas(image, { contrast: 1.7, grayscale: true, threshold: 165, paddingRatio: 0.14, crop: { x: 0, y: 0.62, width: 1, height: 0.38 }, minDimension: 1600 }),
            // O QR da nota fiscal em contas costuma ficar no quadrante inferior esquerdo.
            createImageVariantCanvas(image, { contrast: 1.72, grayscale: true, paddingRatio: 0.14, crop: { x: 0.02, y: 0.34, width: 0.28, height: 0.26 }, minDimension: 2200 }),
            createImageVariantCanvas(image, { contrast: 1.92, grayscale: true, threshold: 160, paddingRatio: 0.16, crop: { x: 0.02, y: 0.34, width: 0.3, height: 0.28 }, minDimension: 2400 }),
            createImageVariantCanvas(image, { contrast: 1.6, grayscale: true, paddingRatio: 0.12, crop: { x: 0.4, y: 0.42, width: 0.6, height: 0.58 }, minDimension: 1500 }),
            createImageVariantCanvas(image, { contrast: 1.6, grayscale: true, paddingRatio: 0.12, crop: { x: 0, y: 0.42, width: 0.6, height: 0.58 }, minDimension: 1500 }),
            createImageVariantCanvas(image, { rotation: 90, paddingRatio: 0.08 }),
            createImageVariantCanvas(image, { rotation: 180, paddingRatio: 0.08 }),
            createImageVariantCanvas(image, { rotation: 270, paddingRatio: 0.08 })
        ];

        for (let index = 0; index < variants.length; index += 1) {
            const variant = variants[index];
            const nativeResult = await tryDecodeWithNativeDetector(variant);
            if (nativeResult) return nativeResult;

            const variantFile = await canvasToFile(variant, `variant-${index + 1}.png`);
            try {
                return await tryDecodeWithHtml5Qrcode(reader, variantFile);
            } catch {
                // Continua tentando.
            }
        }

        throw initialError;
    } finally {
        try {
            await reader.clear();
        } catch {
            // Ignora limpeza repetida.
        }
    }
};

const Scanner = ({ onComplete }) => {
    const [status, setStatus] = useState('idle');
    const [processingMessage, setProcessingMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [pixExpenseDraft, setPixExpenseDraft] = useState(null);
    const [pixFormError, setPixFormError] = useState('');
    const [linkInput, setLinkInput] = useState('');
    const fileInputRef = useRef(null);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [availableCameras, setAvailableCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const videoRef = useRef(null);
    const zxingReader = useRef(null);
    const scanInterval = useRef(null);




    const ensureCategoryExists = useCallback(async (categoryName) => {
        const name = String(categoryName || '').trim();
        if (!name) return;
        const existing = await db.categories.where('name').equals(name).first();
        if (!existing) {
            await db.categories.add({ name, color: DEFAULT_CATEGORY_COLOR });
        }
    }, []);

    const persistFiscalReceipt = useCallback(async (url) => {
        setStatus('processing');
        setProcessingMessage('Processando dados do cupom fiscal...');
        const data = await processNFCeURL(url);

        if (!data || data.isPartial || !Array.isArray(data.products) || !data.products.length) {
            setStatus('error');
            setErrorMessage(data?.partialMessage || 'Nao foi possivel extrair os dados completos do cupom fiscal.');
            return;
        }

        if (data.accessKey) {
            const existing = await db.receipts.where('accessKey').equals(data.accessKey).first();
            if (existing) {
                setStatus('error');
                setErrorMessage('Este cupom fiscal ja foi importado anteriormente.');
                return;
            }
        }

        for (const product of data.products) {
            await ensureCategoryExists(product.category || autoCategorize(product.name));
        }

        const receiptId = await db.receipts.add({
            establishment: data.establishment || 'Cupom fiscal',
            date: data.date || new Date().toISOString(),
            totalValue: Number(data.totalValue) || 0,
            url,
            accessKey: data.accessKey,
            receiptNumber: data.receiptNumber,
            paymentMethod: data.paymentMethod || PAYMENT_METHOD_NOT_INFORMED,
            isPartial: false
        });

        await db.products.bulkAdd(data.products.map((product) => ({
            receiptId,
            name: product.name || 'Produto sem nome',
            brand: product.brand || '',
            quantity: Number(product.quantity) || 1,
            unit: product.unit || 'UN',
            unitPrice: Number(product.unitPrice) || 0,
            totalValue: Number(product.totalValue) || 0,
            category: product.category || autoCategorize(product.name),
            paymentMethod: data.paymentMethod || PAYMENT_METHOD_NOT_INFORMED
        })));

        setStatus('success');
        setSuccessMessage('Cupom fiscal importado com sucesso.');
        setProcessingMessage('');
        window.setTimeout(() => onComplete?.(), 1200);
    }, [ensureCategoryExists, onComplete]);

    const savePixExpense = useCallback(async () => {
        if (!pixExpenseDraft?.receiver && !pixExpenseDraft?.pixKey && !pixExpenseDraft?.txid) {
            setPixFormError('Nao foi possivel identificar o recebedor ou a chave Pix.');
            return;
        }
        if ((Number(pixExpenseDraft?.value) || 0) <= 0) {
            setPixFormError('Informe o valor da despesa Pix para continuar.');
            return;
        }

        await ensureCategoryExists(pixExpenseDraft.category);
        const numericValue = parseCurrencyInput(pixExpenseDraft.value);
        const expenseKey = buildPixExpenseIdentityKey({ ...pixExpenseDraft, value: numericValue });
        const existingExpense = await db.pixExpenses.where('expenseKey').equals(expenseKey).first();

        if (existingExpense) {
            setStatus('error');
            setErrorMessage('Ja existe uma despesa Pix cadastrada com os mesmos dados para a data informada.');
            return;
        }

        await db.pixExpenses.add({
            expenseKey,
            type: 'expense',
            origin: 'qr_pix',
            paymentMethod: 'Pix',
            receiver: String(pixExpenseDraft.receiver || '').trim(),
            value: numericValue,
            date: toStoredDateTime(pixExpenseDraft.date),
            category: String(pixExpenseDraft.category || '').trim(),
            description: String(pixExpenseDraft.description || '').trim(),
            city: String(pixExpenseDraft.city || '').trim(),
            txid: String(pixExpenseDraft.txid || '').trim(),
            pixKey: String(pixExpenseDraft.pixKey || '').trim(),
            payloadType: String(pixExpenseDraft.payloadType || 'Nao informado').trim(),
            merchantCategoryCode: String(pixExpenseDraft.merchantCategoryCode || '').trim(),
            transactionCurrency: String(pixExpenseDraft.transactionCurrency || '').trim(),
            payloadOriginal: String(pixExpenseDraft.payloadOriginal || '').trim(),
            confirmationStatus: 'Confirmado',
            confirmedByUser: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        setPixExpenseDraft(null);
        setPixFormError('');
        setStatus('success');
        setSuccessMessage('Despesa Pix salva com sucesso.');
        window.setTimeout(() => onComplete?.(), 1200);
    }, [ensureCategoryExists, onComplete, pixExpenseDraft]);

    const handleScannedContent = useCallback(async (content) => {
        setErrorMessage('');
        setSuccessMessage('');
        setPixFormError('');

        if (/^\d{44}$/.test(content) || /^\d{47,48}$/.test(content.replace(/\D/g, ''))) {
            setStatus('success');
            setSuccessMessage(`Boleto / Arrecadação identificado e copiado:\n${content}`);
            try { if (navigator.clipboard) navigator.clipboard.writeText(content); } catch(e) {}
            return;
        } else if (/^\d{8,14}$/.test(content) && !content.startsWith('http')) {
             setStatus('success');
             setSuccessMessage(`Código do Produto / EAN identificado e copiado:\n${content}`);
             try { if (navigator.clipboard) navigator.clipboard.writeText(content); } catch(e) {}
             return;
        }

        const qrResult = processarQRCode(content);

        if (qrResult.type === 'receipt') {
            await persistFiscalReceipt(qrResult.rawContent);
            return;
        }

        if (qrResult.type === 'pix') {
            setPixExpenseDraft({
                receiver: String(qrResult.data.receiver || '').trim(),
                value: qrResult.data.amount ?? '',
                date: toInputDateValue(new Date()),
                category: String(qrResult.data.suggestedCategory || 'Outros').trim() || 'Outros',
                description: String(qrResult.data.description || '').trim(),
                city: String(qrResult.data.city || '').trim(),
                txid: String(qrResult.data.txid || '').trim(),
                pixKey: String(qrResult.data.pixKey || '').trim(),
                payloadType: String(qrResult.data.payloadType || 'Nao informado').trim(),
                merchantCategoryCode: String(qrResult.data.merchantCategoryCode || '').trim(),
                transactionCurrency: String(qrResult.data.transactionCurrency || '').trim(),
                payloadOriginal: String(qrResult.data.payloadOriginal || qrResult.rawContent || '').trim()
            });
            setStatus('pix-confirm');
            return;
        }

        setStatus('error');
        setErrorMessage('Nao foi possivel identificar se este QR Code e um cupom fiscal ou um QR Pix de pagamento.');
    }, [persistFiscalReceipt]);



    const stopLiveCamera = useCallback(() => {
        setIsCameraActive(false);
        if (scanInterval.current) {
            clearInterval(scanInterval.current);
            scanInterval.current = null;
        }
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
    }, []);

    useEffect(() => {
        return () => stopLiveCamera();
    }, [stopLiveCamera]);

    const scanFrame = useCallback(async () => {
        if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) return;
        try {
            if (window.BarcodeDetector) {
                const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'itf'] });
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0) {
                    stopLiveCamera();
                    handleScannedContent(barcodes[0].rawValue);
                    return;
                }
            } else {
                if (!zxingReader.current) zxingReader.current = new BrowserMultiFormatReader();
                const result = zxingReader.current.decodeFromVideoElement(videoRef.current);
                if (result && result.getText()) {
                    stopLiveCamera();
                    handleScannedContent(result.getText());
                    return;
                }
            }
        } catch(e) {}
    }, [handleScannedContent, stopLiveCamera]);

    const startLiveCamera = async (deviceId = null) => {
        try {
            const isSwitching = typeof deviceId === 'string' && deviceId.length > 0;
            if (!isSwitching) {
                resetState();
                setIsCameraActive(true);
            } else {
                if (videoRef.current && videoRef.current.srcObject) {
                    videoRef.current.srcObject.getTracks().forEach(track => track.stop());
                }
                if (scanInterval.current) clearInterval(scanInterval.current);
            }

            const constraints = {
                video: isSwitching ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
                audio: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(d => d.kind === 'videoinput');
                setAvailableCameras(videoDevices);
                
                if (videoDevices.length > 0) {
                    const currentTrack = stream.getVideoTracks()[0];
                    const activeDevice = videoDevices.find(d => d.label === currentTrack.label);
                    if (activeDevice && !isSwitching) setSelectedCameraId(activeDevice.deviceId);
                    else if (isSwitching) setSelectedCameraId(deviceId);
                }
            } catch(e) {}

            // We use setTimeout to ensure the videoRef is mounted
            setTimeout(async () => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', 'true');
                    await videoRef.current.play();
                    try {
                        const track = stream.getVideoTracks()[0];
                        const caps = track.getCapabilities() || {};
                        if (caps.focusMode && caps.focusMode.includes('continuous')) {
                            await track.applyConstraints({ focusMode: 'continuous' });
                        }
                    } catch(e) {}
                    scanInterval.current = setInterval(scanFrame, 300);
                }
            }, 100);
        } catch (e) {
            stopLiveCamera();
            setStatus('error');
            setErrorMessage('Não foi possível acessar a câmera do dispositivo. Verifique as permissões do navegador.');
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStatus('processing');
        setProcessingMessage('Lendo QR Code da imagem...');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const decodedText = await decodeQrFromImageFile(file);
            await handleScannedContent(decodedText);
        } catch (error) {
            console.error('Erro na leitura do arquivo:', error);
            setStatus('error');
            setProcessingMessage('');
            setErrorMessage('Nao foi possivel localizar um QR Code legivel nesta imagem. Tente outra foto mais nitida ou uma imagem em melhor resolucao.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleLinkSubmit = async (event) => {
        event.preventDefault();
        const qrContent = String(linkInput || '').trim();
        if (!qrContent) return;
        setStatus('processing');
        setProcessingMessage('Processando conteudo informado...');
        await handleScannedContent(qrContent);
    };

    const resetState = async () => {
        setStatus('idle');
        setProcessingMessage('');
        setErrorMessage('');
        setSuccessMessage('');
        setPixExpenseDraft(null);
        setPixFormError('');
        stopLiveCamera();
    };

    return (
        <div className="animate-slide-up">
            <div id="reader-hidden" style={{ position: 'absolute', left: '-10000px', top: '-10000px', width: '360px', height: '360px', overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} />

            <div className="glass-card" style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0 }}>Leitor de QR Code</h3>
                </div>
                <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: 'var(--text-light)' }}>Escaneie seu cupom fiscal, QR Pix ou código de barras.</p>

                {status === 'idle' && !isCameraActive && (
                    <button type="button" className="btn-primary" onClick={() => startLiveCamera(null)} style={{ width: '100%', padding: '16px', marginBottom: '22px', fontSize: '1rem' }}>
                        <Camera size={22} style={{ marginRight: '8px' }} /> Usar Câmera do Dispositivo
                    </button>
                )}

                {isCameraActive && (
                    <div className="scanner-container">
                        <video ref={videoRef} className="scanner-video" autoPlay playsInline muted></video>
                        <div className="scanner-overlay">
                            <div className="guide-box">
                                <div className="guide-corners"></div>
                                <div className="laser"></div>
                            </div>
                            <p style={{ marginTop: '24px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Aponte para o código</p>
                        </div>
                        {availableCameras.length > 1 && (
                            <select 
                                value={selectedCameraId} 
                                onChange={(e) => startLiveCamera(e.target.value)}
                                style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', width: 'auto', zIndex: 10, background: 'rgba(0,0,0,0.85)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', padding: '10px 14px', fontSize: '0.9rem' }}
                            >
                                {availableCameras.map(cam => (
                                    <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Câmera ${cam.deviceId.substring(0, 5)}...`}</option>
                                ))}
                            </select>
                        )}
                        <button type="button" onClick={stopLiveCamera} className="btn-secondary" style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)' }}>
                            Cancelar
                        </button>
                    </div>
                )}

                {status === 'processing' && (
                    <div className="premium-surface" style={{ padding: '24px 18px', marginBottom: '18px' }}>
                        <Loader2 className="animate-spin" size={28} style={{ marginBottom: '12px' }} />
                        <div>{processingMessage || 'Analisando o QR Code informado...'}</div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="premium-surface" style={{ padding: '24px 18px', marginBottom: '18px' }}>
                        <AlertCircle size={28} color="#EF4444" style={{ marginBottom: '12px' }} />
                        <div style={{ marginBottom: '12px' }}>{errorMessage}</div>
                        <button type="button" className="btn-primary" onClick={resetState}>Tentar novamente</button>
                    </div>
                )}

                {status === 'success' && (
                    <div className="premium-surface" style={{ padding: '24px 18px', marginBottom: '18px' }}>
                        <CheckCircle2 size={28} color="#22C55E" style={{ marginBottom: '12px' }} />
                        <div style={{ marginBottom: '12px' }}>{successMessage}</div>
                        <button type="button" className="btn-primary" onClick={resetState}>Ler outro QR Code</button>
                    </div>
                )}

                {status === 'pix-confirm' && pixExpenseDraft && (
                    <div className="premium-surface" style={{ textAlign: 'left', marginBottom: '18px' }}>
                        <div className="section-heading">
                            <div>
                                <span className="eyebrow">Confirmacao Pix</span>
                                <h2>Revise antes de salvar</h2>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <input type="text" placeholder="Recebedor" value={pixExpenseDraft.receiver} onChange={(event) => setPixExpenseDraft((current) => ({ ...current, receiver: event.target.value }))} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                                <input type="number" step="0.01" placeholder="Valor" value={pixExpenseDraft.value} onChange={(event) => setPixExpenseDraft((current) => ({ ...current, value: event.target.value }))} />
                                <input type="date" value={pixExpenseDraft.date} onChange={(event) => setPixExpenseDraft((current) => ({ ...current, date: event.target.value }))} />
                            </div>
                            <select value={pixExpenseDraft.category} onChange={(event) => setPixExpenseDraft((current) => ({ ...current, category: event.target.value }))}>
                                {PIX_EXPENSE_CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                            </select>
                            <input type="text" placeholder="Descricao" value={pixExpenseDraft.description} onChange={(event) => setPixExpenseDraft((current) => ({ ...current, description: event.target.value }))} />
                            {pixFormError ? <div style={{ color: '#EF4444', fontSize: '0.82rem' }}>{pixFormError}</div> : null}
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button type="button" className="btn-secondary" onClick={resetState}>Cancelar</button>
                                <button type="button" className="btn-primary" onClick={savePixExpense}><Save size={16} /> Salvar Pix</button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gap: '18px' }}>
                    <div style={{ padding: '18px 0', borderTop: '1px solid #eee' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>Carregar imagem do QRCode</label>
                        <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} />
                        <button type="button" className="btn-primary" style={{ background: 'white', color: 'var(--primary-blue)', border: '1px solid #ddd' }} onClick={() => fileInputRef.current?.click()}>
                            <ImageIcon size={18} /> Carregar Imagem
                        </button>
                    </div>

                    <div style={{ padding: '18px 0', borderTop: '1px solid #eee' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>Ou cole o conteudo do QR Code</label>
                        <form onSubmit={handleLinkSubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <input type="text" placeholder="Cole o link fiscal ou payload Pix" value={linkInput} onChange={(event) => setLinkInput(event.target.value)} style={{ flex: 1, minWidth: '220px' }} />
                            <button type="submit" className="btn-primary"><QrCode size={18} /> Processar</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Scanner;
