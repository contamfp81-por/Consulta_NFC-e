import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, Camera, CheckCircle2, Image as ImageIcon, Loader2, QrCode, Save } from 'lucide-react';
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
const MACRO_CAMERA_OPTION_ID = '__scanner_macro_camera__';
const DEFAULT_SCAN_CONFIG = {
    fps: 12,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.85); // Aumenta a area de leitura para 85%
        return {
            width: Math.max(220, qrboxSize),
            height: Math.max(220, qrboxSize)
        };
    },
    videoConstraints: {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
    }
};

const createQrCodeReader = (elementId) => new Html5Qrcode(elementId, QR_READER_OPTIONS);
const normalizeCameraLabelText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeCameraList = (cameras = []) => cameras.map((camera, index) => ({
    ...camera,
    label: String(camera.label || '').trim() || `Camera ${index + 1}`,
    normalizedLabel: normalizeCameraLabelText(camera.label || '')
}));

const hasAnyKeyword = (text, keywords = []) => keywords.some((keyword) => text.includes(keyword));

const isFrontFacingCamera = (camera) => hasAnyKeyword(camera?.normalizedLabel || '', ['front', 'frontal', 'selfie', 'user', 'face']);
const isRearFacingCamera = (camera) => hasAnyKeyword(camera?.normalizedLabel || '', ['back', 'rear', 'traseira', 'environment', 'externa', 'principal', 'main']);
const isMacroNamedCamera = (camera) => hasAnyKeyword(camera?.normalizedLabel || '', ['macro', 'ultra-wide', 'ultrawide', 'wide-angle', 'wide angle', '0.5x', '0,5x']);

const scoreMacroCameraCandidate = (camera) => {
    const label = camera?.normalizedLabel || '';
    let score = 0;

    if (isFrontFacingCamera(camera)) {
        score -= 100;
    } else {
        score += 5; // Assume que qualquer lente não-frontal seja traseira e pontua
    }

    if (isRearFacingCamera(camera)) score += 35;
    if (label.includes('macro')) score += 120;
    if (hasAnyKeyword(label, ['ultra-wide', 'ultrawide', 'wide-angle', 'wide angle', '0.5x', '0,5x'])) score += 70;

    return score;
};

const scoreRearCameraCandidate = (camera) => {
    let score = 0;

    if (isFrontFacingCamera(camera)) {
        score -= 100;
    } else {
        score += 10; // Se não for frontal, assume como forte candidata traseira
    }

    if (isRearFacingCamera(camera)) score += 80;
    if (isMacroNamedCamera(camera)) score += 20;
    
    if (camera?.label?.includes(' 0') || camera?.id?.endsWith('0')) score += 5;

    return score;
};

const pickBestCamera = (cameras = [], scoreCamera, minimumScore = 1) => {
    if (!Array.isArray(cameras) || !cameras.length) return null;

    const ranked = [...cameras]
        .map((camera) => ({ camera, score: scoreCamera(camera) }))
        .sort((left, right) => right.score - left.score);

    return ranked[0] && ranked[0].score >= minimumScore ? ranked[0].camera : null;
};

const getBestMacroCamera = (cameras = []) => pickBestCamera(cameras, scoreMacroCameraCandidate);
const getBestRearCamera = (cameras = []) => pickBestCamera(cameras, scoreRearCameraCandidate);
const hasDetailedCameraLabels = (cameras = []) => cameras.some((camera) => Boolean(camera?.normalizedLabel));

const buildCameraOptions = (cameras = []) => {
    if (!Array.isArray(cameras) || !cameras.length) return [];

    const macroCamera = getBestMacroCamera(cameras);
    const macroLabel = macroCamera
        ? `Camera macro / close-up (${macroCamera.label})`
        : 'Camera macro / close-up';

    return [
        { id: MACRO_CAMERA_OPTION_ID, label: macroLabel, mode: 'macro' },
        ...cameras.map((camera) => ({
            id: camera.id,
            label: camera.label,
            mode: 'device'
        }))
    ];
};

const resolveSelectedCamera = (selectedCameraId, cameras = []) => {
    if (selectedCameraId === MACRO_CAMERA_OPTION_ID) {
        const macroCandidate = getBestMacroCamera(cameras);
        const rearCandidate = getBestRearCamera(cameras);
        const resolvedCamera = macroCandidate || rearCandidate || null;

        return {
            mode: 'macro',
            resolvedCamera,
            startTarget: resolvedCamera?.id || { facingMode: 'environment' }
        };
    }

    return {
        mode: 'device',
        resolvedCamera: cameras.find((camera) => camera.id === selectedCameraId) || null,
        startTarget: selectedCameraId
    };
};

const buildPreferredResolutionConstraint = (capabilities = {}) => {
    const widthMax = Number.isFinite(capabilities.width?.max) ? capabilities.width.max : null;
    const heightMax = Number.isFinite(capabilities.height?.max) ? capabilities.height.max : null;

    if (widthMax === null && heightMax === null) return null;

    return {
        width: widthMax !== null ? { ideal: Math.min(widthMax, 2560) } : undefined,
        height: heightMax !== null ? { ideal: Math.min(heightMax, 1440) } : undefined
    };
};

const buildMacroFocusConstraintCandidates = (capabilities = {}, settings = {}) => {
    const candidates = [];
    const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
    const focusDistanceMin = Number.isFinite(capabilities.focusDistance?.min) ? capabilities.focusDistance.min : null;
    const currentFocusDistance = Number.isFinite(settings?.focusDistance) ? settings.focusDistance : null;

    if (focusModes.includes('manual') && focusDistanceMin !== null) {
        candidates.push({ advanced: [{ focusMode: 'manual', focusDistance: focusDistanceMin }] });
    }

    if (focusDistanceMin !== null && currentFocusDistance !== focusDistanceMin) {
        candidates.push({ advanced: [{ focusDistance: focusDistanceMin }] });
    }

    if (focusModes.includes('continuous')) {
        candidates.push({ advanced: [{ focusMode: 'continuous' }] });
    } else if (focusModes.includes('single-shot')) {
        candidates.push({ advanced: [{ focusMode: 'single-shot' }] });
    }

    return candidates;
};

const buildMacroConstraintSteps = (capabilities = {}, settings = {}) => {
    const steps = [];
    const preferredResolution = buildPreferredResolutionConstraint(capabilities);
    const focusConstraintCandidates = buildMacroFocusConstraintCandidates(capabilities, settings);
    const zoomMin = Number.isFinite(capabilities.zoom?.min) ? capabilities.zoom.min : null;
    const zoomMax = Number.isFinite(capabilities.zoom?.max) ? capabilities.zoom.max : null;
    const currentZoom = Number.isFinite(settings?.zoom) ? settings.zoom : null;

    if (preferredResolution) {
        steps.push(preferredResolution);
    }

    if (zoomMin !== null && zoomMax !== null) {
        // Applica um zoom moderado (2.3x) para focar melhor em QR codes pequenos nos cupons fiscais
        const targetZoom = Math.min(zoomMax, Math.max(zoomMin, 2.3));
        if (currentZoom !== targetZoom) {
            steps.push({ advanced: [{ zoom: targetZoom }] });
        }
    } else if (zoomMin !== null && currentZoom !== zoomMin) {
        steps.push({ advanced: [{ zoom: zoomMin }] });
    }

    if (focusConstraintCandidates.length) {
        steps.push(...focusConstraintCandidates);
    }

    return steps;
};

const applyMacroProfileIfSupported = async (scanner) => {
    if (!scanner || typeof scanner.getRunningTrackCapabilities !== 'function' || typeof scanner.applyVideoConstraints !== 'function') {
        return;
    }

    let capabilities = null;
    let settings = null;

    try {
        capabilities = scanner.getRunningTrackCapabilities();
        settings = scanner.getRunningTrackSettings?.() || {};
    } catch {
        return;
    }

    const constraintSteps = buildMacroConstraintSteps(capabilities, settings);
    for (const constraints of constraintSteps) {
        try {
            await scanner.applyVideoConstraints(constraints);
        } catch {
            // Nem todo navegador expõe foco ou zoom para a camera ativa.
        }
    }
};

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
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [linkInput, setLinkInput] = useState('');
    const fileInputRef = useRef(null);
    const scannerRef = useRef(null);
    const cameraOptions = buildCameraOptions(cameras);
    const isMacroCameraSelected = selectedCameraId === MACRO_CAMERA_OPTION_ID;

    const stopScanner = useCallback(async () => {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (!scanner) return;
        try { await scanner.stop(); } catch { /* limpeza defensiva */ }
        try { await scanner.clear(); } catch { /* limpeza defensiva */ }
    }, []);

    const loadAvailableCameras = useCallback(async (preserveCurrentSelection = true) => {
        try {
            const availableCameras = await Html5Qrcode.getCameras();
            const normalized = normalizeCameraList(availableCameras);
            setCameras(normalized);

            if (!preserveCurrentSelection) {
                setSelectedCameraId(normalized.length > 0 ? MACRO_CAMERA_OPTION_ID : '');
            } else {
                setSelectedCameraId((currentSelectedCameraId) => currentSelectedCameraId || (normalized.length > 0 ? MACRO_CAMERA_OPTION_ID : ''));
            }

            return normalized;
        } catch (error) {
            console.error('Erro ao listar cameras:', error);
            setCameras([]);
            if (!preserveCurrentSelection) {
                setSelectedCameraId('');
            }
            return [];
        }
    }, []);

    const unlockCameraLabelsForMacroSelection = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            return cameras;
        }

        let temporaryStream = null;
        try {
            temporaryStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            });
        } catch {
            return cameras;
        } finally {
            temporaryStream?.getTracks?.().forEach((track) => {
                try {
                    track.stop();
                } catch {
                    // Ignora falhas ao encerrar stream temporaria.
                }
            });
        }

        return loadAvailableCameras(true);
    }, [cameras, loadAvailableCameras]);

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

    useEffect(() => {
        loadAvailableCameras(false);

        return () => {
            stopScanner();
        };
    }, [loadAvailableCameras, stopScanner]);

    useEffect(() => {
        if (status !== 'scanning' || !selectedCameraId) return undefined;
        let cancelled = false;

        const startScanner = async () => {
            try {
                let availableCameras = cameras;
                if (selectedCameraId === MACRO_CAMERA_OPTION_ID) {
                    const missingMacroDetails = !hasDetailedCameraLabels(availableCameras) || !getBestMacroCamera(availableCameras);
                    if (missingMacroDetails) {
                        availableCameras = await unlockCameraLabelsForMacroSelection();
                    }
                }

                const scanner = createQrCodeReader('reader');
                scannerRef.current = scanner;
                const cameraSelection = resolveSelectedCamera(selectedCameraId, availableCameras);
                await scanner.start(cameraSelection.startTarget, DEFAULT_SCAN_CONFIG, async (decodedText) => {
                    if (cancelled) return;
                    await stopScanner();
                    await handleScannedContent(decodedText);
                }, () => {});
                if (cameraSelection.mode === 'macro') {
                    await applyMacroProfileIfSupported(scanner);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('Erro ao iniciar camera:', error);
                setStatus('error');
                setErrorMessage('Falha ao acessar esta camera. Tente outra disponivel no aparelho.');
                await stopScanner();
            }
        };

        startScanner();

        return () => {
            cancelled = true;
            stopScanner();
        };
    }, [cameras, handleScannedContent, selectedCameraId, status, stopScanner, unlockCameraLabelsForMacroSelection]);

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
        await stopScanner();
        setStatus('idle');
        setProcessingMessage('');
        setErrorMessage('');
        setSuccessMessage('');
        setPixExpenseDraft(null);
        setPixFormError('');
    };

    return (
        <div className="animate-slide-up">
            <div id="reader-hidden" style={{ position: 'absolute', left: '-10000px', top: '-10000px', width: '360px', height: '360px', overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} />

            <div className="glass-card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '10px' }}>Leitor de QR Code</h3>
                <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: 'var(--text-light)' }}>Escaneie um cupom fiscal ou um QR Pix de pagamento.</p>

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

                {status === 'scanning' ? (
                    <div className="premium-surface" style={{ marginBottom: '18px' }}>
                        <div id="reader" style={{ minHeight: '320px' }} />
                        <button type="button" className="btn-secondary" style={{ marginTop: '14px' }} onClick={resetState}>Fechar camera</button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '18px' }}>
                        <div style={{ padding: '18px 0', borderTop: '1px solid #eee' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>Lente selecionada</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <select style={{ flex: 1, minWidth: '220px' }} value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)}>
                                    {cameraOptions.length > 0 ? cameraOptions.map((camera) => <option key={camera.id} value={camera.id}>{camera.label}</option>) : <option value="">Nenhuma camera detectada</option>}
                                </select>
                                <button type="button" className="btn-primary" onClick={() => setStatus('scanning')} disabled={!selectedCameraId}><Camera size={18} /> Abrir camera</button>
                            </div>
                            {isMacroCameraSelected ? (
                                <p style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-light)', textAlign: 'left' }}>
                                    O modo macro tenta abrir a melhor camera traseira para close-up e aplicar foco continuo ou aproximacao compativel, quando o navegador do aparelho expuser esses recursos.
                                </p>
                            ) : null}
                        </div>

                        <div style={{ padding: '18px 0', borderTop: '1px solid #eee' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>Ou use um arquivo de imagem</label>
                            <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} />
                            <button type="button" className="btn-primary" style={{ background: 'white', color: 'var(--primary-blue)', border: '1px solid #ddd' }} onClick={() => fileInputRef.current?.click()}>
                                <ImageIcon size={18} /> Carregar QR Code
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
                )}
            </div>
        </div>
    );
};

export default Scanner;
