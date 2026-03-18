import React, { useEffect, useEffectEvent, useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { buildPixExpenseIdentityKey, PIX_EXPENSE_CATEGORY_OPTIONS, processarQRCode } from '../utils/qrCode';
import {
    Camera,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Image as ImageIcon,
    RotateCw,
    X,
    Wallet,
    Calendar,
    Save,
    PencilLine,
    Landmark,
    Hash,
    FileText,
    MapPin,
    QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QR_READER_OPTIONS = {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported: true
};

const MotionDiv = motion.div;
const PIX_CONFIRMATION_STATUS_OPTIONS = ['Confirmado', 'Pendente', 'Agendado'];
const PIX_DEFAULT_COLOR = '#607D8B';

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

const parseCurrencyInput = (value) => {
    const normalizedValue = String(value || '').replace(',', '.').trim();
    const numericValue = Number(normalizedValue);
    return Number.isFinite(numericValue) ? numericValue : NaN;
};

const formatCurrencyPreview = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
}).format(Number(value) || 0);

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, pix-confirm, success, partial, error
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('Importado com sucesso!');
    const [processingMessage, setProcessingMessage] = useState('Analisando o QR Code...');
    const [pixExpenseDraft, setPixExpenseDraft] = useState(null);
    const [pixFormError, setPixFormError] = useState('');
    const [showPixAdvancedFields, setShowPixAdvancedFields] = useState(false);
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);
    const [linkInput, setLinkInput] = useState('');
    const categories = useLiveQuery(() => db.categories.toArray()) || [];
    const pixCategoryOptions = Array.from(new Set([
        ...PIX_EXPENSE_CATEGORY_OPTIONS,
        ...categories.map((category) => category?.name).filter(Boolean),
        pixExpenseDraft?.category
    ].filter(Boolean))).sort((left, right) => left.localeCompare(right, 'pt-BR'));

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

    const resetScannerState = async () => {
        await stopScanner();
        setStatus('idle');
        setErrorMessage('');
        setSuccessMessage('Importado com sucesso!');
        setProcessingMessage('Analisando o QR Code...');
        setPixExpenseDraft(null);
        setPixFormError('');
        setShowPixAdvancedFields(false);
    };

    const buildPixExpenseDraft = (pixData, rawContent) => ({
        receiver: pixData.receiver || '',
        value: pixData.amount !== null && pixData.amount !== undefined
            ? Number(pixData.amount).toFixed(2)
            : '',
        date: new Date().toISOString().split('T')[0],
        category: pixData.suggestedCategory || 'Outros',
        subcategory: '',
        observation: '',
        description: pixData.description || '',
        confirmationStatus: 'Confirmado',
        city: pixData.city || '',
        txid: pixData.txid || '',
        pixKey: pixData.pixKey || '',
        payloadType: pixData.payloadType || 'Nao informado',
        merchantCategoryCode: pixData.merchantCategoryCode || '',
        transactionCurrency: pixData.transactionCurrency || '',
        payloadOriginal: rawContent || pixData.payloadOriginal || ''
    });

    const ensureCategoryExists = async (categoryName) => {
        const normalizedCategoryName = String(categoryName || '').trim();
        if (!normalizedCategoryName) {
            return;
        }

        const existingCategory = await db.categories.where('name').equals(normalizedCategoryName).first();
        if (!existingCategory) {
            await db.categories.add({
                name: normalizedCategoryName,
                color: PIX_DEFAULT_COLOR
            });
        }
    };

    const persistFiscalReceipt = async (url) => {
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
                const productsWithIds = await Promise.all(data.products.map(async (product) => {
                    // Try to get from knowledge base
                    const learned = await db.productKnowledge.get({ name: product.name });
                    
                    return {
                        ...product,
                        receiptId,
                        paymentMethod: data.paymentMethod,
                        category: learned ? learned.category : autoCategorize(product.name)
                    };
                }));
                await db.products.bulkAdd(productsWithIds);
            }

            setStatus('success');
            setSuccessMessage('Cupom fiscal importado com sucesso!');
            setTimeout(() => onComplete?.(), 2000);
        } catch (err) {
            console.error('Erro no robô:', err);
            setStatus('error');
            setErrorMessage('Falha ao obter dados da SEFAZ. Verifique sua conexão.');
        }
    };

    const validatePixExpenseDraft = (draft) => {
        if (!draft) {
            return 'Nenhuma despesa Pix foi carregada para confirmacao.';
        }

        if (!String(draft.receiver || '').trim()) {
            return 'Informe o nome do recebedor.';
        }

        const numericValue = parseCurrencyInput(draft.value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            return 'Informe um valor numerico valido para a despesa.';
        }

        const dateValue = new Date(draft.date);
        if (Number.isNaN(dateValue.getTime())) {
            return 'Informe uma data valida para a despesa.';
        }

        if (!String(draft.category || '').trim()) {
            return 'Selecione uma categoria para continuar.';
        }

        return '';
    };

    const savePixExpense = async () => {
        const validationMessage = validatePixExpenseDraft(pixExpenseDraft);
        if (validationMessage) {
            setPixFormError(validationMessage);
            setShowPixAdvancedFields(true);
            return;
        }

        const numericValue = parseCurrencyInput(pixExpenseDraft.value);
        const expenseKey = buildPixExpenseIdentityKey({
            ...pixExpenseDraft,
            value: numericValue
        });
        setStatus('processing');
        setProcessingMessage('Salvando despesa Pix...');
        setPixFormError('');

        try {
            await ensureCategoryExists(pixExpenseDraft.category);

            const existingExpense = await db.pixExpenses.where('expenseKey').equals(expenseKey).first();
            if (existingExpense) {
                setStatus('error');
                setErrorMessage('Esta despesa via QR Pix ja foi cadastrada anteriormente.');
                return;
            }

            await db.pixExpenses.add({
                expenseKey,
                type: 'expense',
                origin: 'qr_pix',
                paymentMethod: 'Pix',
                receiver: String(pixExpenseDraft.receiver || '').trim(),
                value: numericValue,
                date: new Date(pixExpenseDraft.date).toISOString(),
                category: String(pixExpenseDraft.category || '').trim(),
                subcategory: String(pixExpenseDraft.subcategory || '').trim(),
                observation: String(pixExpenseDraft.observation || '').trim(),
                description: String(pixExpenseDraft.description || '').trim(),
                confirmationStatus: String(pixExpenseDraft.confirmationStatus || 'Confirmado').trim(),
                city: String(pixExpenseDraft.city || '').trim(),
                txid: String(pixExpenseDraft.txid || '').trim(),
                pixKey: String(pixExpenseDraft.pixKey || '').trim(),
                payloadType: String(pixExpenseDraft.payloadType || 'Nao informado').trim(),
                merchantCategoryCode: String(pixExpenseDraft.merchantCategoryCode || '').trim(),
                transactionCurrency: String(pixExpenseDraft.transactionCurrency || '').trim(),
                payloadOriginal: String(pixExpenseDraft.payloadOriginal || '').trim(),
                confirmedByUser: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            setPixExpenseDraft(null);
            setShowPixAdvancedFields(false);
            setStatus('success');
            setSuccessMessage('Despesa Pix salva com sucesso!');
            setTimeout(() => onComplete?.(), 1600);
        } catch (error) {
            console.error('Erro ao salvar despesa Pix:', error);
            setStatus('error');
            setErrorMessage('Nao foi possivel salvar a despesa Pix. Revise os dados e tente novamente.');
        }
    };

    const handleScannedContent = async (content) => {
        setStatus('processing');
        setErrorMessage('');
        setPixFormError('');
        setProcessingMessage('Analisando o QR Code...');

        try {
            const qrResult = processarQRCode(content);

            if (qrResult.type === 'receipt') {
                setProcessingMessage('Processando dados do cupom fiscal...');
                await persistFiscalReceipt(qrResult.rawContent);
                return;
            }

            if (qrResult.type === 'pix') {
                const pixDraft = buildPixExpenseDraft(qrResult.data, qrResult.rawContent);
                const existingExpense = await db.pixExpenses
                    .where('expenseKey')
                    .equals(buildPixExpenseIdentityKey(pixDraft))
                    .first();

                if (existingExpense) {
                    setStatus('error');
                    setErrorMessage('Esta despesa via QR Pix ja foi cadastrada anteriormente.');
                    return;
                }

                setPixExpenseDraft(pixDraft);
                setShowPixAdvancedFields(
                    qrResult.data.amount === null
                    || qrResult.data.amount === undefined
                    || !qrResult.data.receiver
                    || Boolean(qrResult.data.description)
                );
                setStatus('pix-confirm');
                return;
            }

            setStatus('error');
            setErrorMessage('Nao foi possivel identificar se este QR Code e um cupom fiscal ou um QR Pix de pagamento.');
        } catch (error) {
            console.error('Erro ao classificar QR Code:', error);
            setStatus('error');
            setErrorMessage('Nao foi possivel interpretar o conteudo deste QR Code. Tente novamente com uma imagem mais nitida.');
        }
    };

    const handleScanSuccess = useEffectEvent(async (decodedText) => {
        await stopScanner();
        await handleScannedContent(decodedText);
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
        setProcessingMessage('Lendo QR Code da imagem...');

        try {
            const decodedText = await decodeQrFromImageFile(file);
            await handleScannedContent(decodedText);
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

    const handleLinkSubmit = (e) => {
        e.preventDefault();
        const qrContent = linkInput.trim();
        if (qrContent) {
            handleScannedContent(qrContent);
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
                <h3 style={{ marginBottom: '10px' }}>Leitor de QR Code</h3>
                <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: 'var(--text-light)' }}>
                    Escaneie um cupom fiscal ou um QR Pix de pagamento.
                </p>

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

                            <div style={{ padding: '20px 0', borderTop: '1px solid #eee' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>
                                    Ou cole o conteudo do QR Code
                                </label>
                                <form onSubmit={handleLinkSubmit} style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Cole o link fiscal ou payload Pix"
                                        value={linkInput}
                                        onChange={(e) => setLinkInput(e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            borderRadius: '12px',
                                            border: '1px solid #ddd',
                                            outline: 'none',
                                            fontSize: '14px'
                                        }}
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        style={{ width: 'auto', padding: '0 20px', whiteSpace: 'nowrap' }}
                                        disabled={!linkInput.trim()}
                                    >
                                        Processar
                                    </button>
                                </form>
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
                                <p style={{ fontWeight: '600', textAlign: 'center' }}>
                                    {status === 'scanning' ? 'Aguardando QR Code...' : processingMessage}
                                </p>
                                <button
                                    onClick={resetScannerState}
                                    className="btn-primary"
                                    style={{ background: '#fefefe', color: '#ff5252', width: 'auto', padding: '10px 25px' }}
                                >
                                    <X size={18} /> Cancelar
                                </button>
                            </div>
                        </MotionDiv>
                    )}

                    {status === 'pix-confirm' && pixExpenseDraft && (
                        <MotionDiv key="pix-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div
                                    style={{
                                        padding: '18px',
                                        borderRadius: '18px',
                                        background: 'linear-gradient(135deg, rgba(26, 35, 126, 0.10), rgba(0, 229, 255, 0.08))',
                                        border: '1px solid rgba(26, 35, 126, 0.12)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <QrCode size={18} color="var(--primary-blue)" />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary-blue)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                    Despesa identificada via QR Pix
                                                </span>
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>
                                                {pixExpenseDraft.receiver || 'Recebedor nao identificado'}
                                            </h4>
                                            <p style={{ margin: '6px 0 0', color: 'var(--text-light)', fontSize: '0.86rem' }}>
                                                Revise os dados antes de salvar a despesa no aplicativo.
                                            </p>
                                        </div>
                                        <div
                                            style={{
                                                minWidth: '150px',
                                                padding: '12px 14px',
                                                borderRadius: '14px',
                                                background: 'rgba(255, 255, 255, 0.9)',
                                                boxShadow: '0 8px 20px rgba(26, 35, 126, 0.08)'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-light)', marginBottom: '4px' }}>Valor identificado</div>
                                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-blue)' }}>
                                                {pixExpenseDraft.value ? formatCurrencyPreview(pixExpenseDraft.value) : 'Nao informado'}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: '10px',
                                            marginTop: '16px'
                                        }}
                                    >
                                        {[
                                            { label: 'Tipo', value: 'Despesa' },
                                            { label: 'Forma de pagamento', value: 'Pix' },
                                            { label: 'Origem', value: 'QR Pix' },
                                            { label: 'Categoria sugerida', value: pixExpenseDraft.category || 'Outros' }
                                        ].map((item) => (
                                            <div
                                                key={item.label}
                                                style={{
                                                    padding: '12px',
                                                    borderRadius: '14px',
                                                    background: 'rgba(255, 255, 255, 0.82)',
                                                    border: '1px solid rgba(148, 163, 184, 0.16)'
                                                }}
                                            >
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginBottom: '4px' }}>{item.label}</div>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                        gap: '14px'
                                    }}
                                >
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Recebedor</span>
                                        <div style={{ position: 'relative' }}>
                                            <Landmark size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                                            <input
                                                type="text"
                                                value={pixExpenseDraft.receiver}
                                                onChange={(event) => setPixExpenseDraft((current) => ({ ...current, receiver: event.target.value }))}
                                                className="glass-card"
                                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', background: 'white' }}
                                                placeholder="Nome do recebedor"
                                            />
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Valor da despesa</span>
                                        <div style={{ position: 'relative' }}>
                                            <Wallet size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={pixExpenseDraft.value}
                                                onChange={(event) => setPixExpenseDraft((current) => ({ ...current, value: event.target.value }))}
                                                className="glass-card"
                                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', background: 'white' }}
                                                placeholder="0,00"
                                            />
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Data da despesa</span>
                                        <div style={{ position: 'relative' }}>
                                            <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-blue)' }} />
                                            <input
                                                type="date"
                                                value={pixExpenseDraft.date}
                                                onChange={(event) => setPixExpenseDraft((current) => ({ ...current, date: event.target.value }))}
                                                className="glass-card"
                                                style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', background: 'white' }}
                                            />
                                        </div>
                                    </label>

                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Categoria</span>
                                        <select
                                            value={pixExpenseDraft.category}
                                            onChange={(event) => setPixExpenseDraft((current) => ({ ...current, category: event.target.value }))}
                                            className="glass-card"
                                            style={{ width: '100%', padding: '12px', margin: 0, borderRadius: '12px', background: 'white' }}
                                        >
                                            {pixCategoryOptions.map((categoryName) => (
                                                <option key={categoryName} value={categoryName}>{categoryName}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    className="glass-card"
                                    onClick={() => setShowPixAdvancedFields((current) => !current)}
                                    style={{
                                        margin: 0,
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px',
                                        color: 'var(--primary-blue)',
                                        border: '1px solid rgba(26, 35, 126, 0.14)',
                                        background: 'rgba(255, 255, 255, 0.88)',
                                        fontWeight: 700
                                    }}
                                >
                                    <PencilLine size={18} />
                                    {showPixAdvancedFields ? 'Ocultar campos adicionais' : 'Editar dados complementares'}
                                </button>

                                {showPixAdvancedFields && (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                            gap: '14px'
                                        }}
                                    >
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Subcategoria</span>
                                            <input
                                                type="text"
                                                value={pixExpenseDraft.subcategory}
                                                onChange={(event) => setPixExpenseDraft((current) => ({ ...current, subcategory: event.target.value }))}
                                                className="glass-card"
                                                style={{ width: '100%', padding: '12px', margin: 0, borderRadius: '12px', background: 'white' }}
                                                placeholder="Ex: conta mensal"
                                            />
                                        </label>

                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Status de confirmacao</span>
                                            <select
                                                value={pixExpenseDraft.confirmationStatus}
                                                onChange={(event) => setPixExpenseDraft((current) => ({ ...current, confirmationStatus: event.target.value }))}
                                                className="glass-card"
                                                style={{ width: '100%', padding: '12px', margin: 0, borderRadius: '12px', background: 'white' }}
                                            >
                                                {PIX_CONFIRMATION_STATUS_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </label>

                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Descricao</span>
                                            <div style={{ position: 'relative' }}>
                                                <FileText size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--primary-blue)' }} />
                                                <textarea
                                                    value={pixExpenseDraft.description}
                                                    onChange={(event) => setPixExpenseDraft((current) => ({ ...current, description: event.target.value }))}
                                                    className="glass-card"
                                                    rows={3}
                                                    style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', background: 'white', resize: 'vertical' }}
                                                    placeholder="Descricao do pagamento"
                                                />
                                            </div>
                                        </label>

                                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Observacao</span>
                                            <div style={{ position: 'relative' }}>
                                                <FileText size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--primary-blue)' }} />
                                                <textarea
                                                    value={pixExpenseDraft.observation}
                                                    onChange={(event) => setPixExpenseDraft((current) => ({ ...current, observation: event.target.value }))}
                                                    className="glass-card"
                                                    rows={3}
                                                    style={{ width: '100%', padding: '12px 12px 12px 40px', margin: 0, borderRadius: '12px', background: 'white', resize: 'vertical' }}
                                                    placeholder="Observacoes adicionais"
                                                />
                                            </div>
                                        </label>
                                    </div>
                                )}

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                        gap: '12px'
                                    }}
                                >
                                    <div className="glass-card" style={{ margin: 0, padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.92)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <Hash size={16} color="var(--primary-blue)" />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>TXID</span>
                                        </div>
                                        <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{pixExpenseDraft.txid || 'Nao informado'}</div>
                                    </div>
                                    <div className="glass-card" style={{ margin: 0, padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.92)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <MapPin size={16} color="var(--primary-blue)" />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Cidade</span>
                                        </div>
                                        <div style={{ fontWeight: 700 }}>{pixExpenseDraft.city || 'Nao informada'}</div>
                                    </div>
                                    <div className="glass-card" style={{ margin: 0, padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.92)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <Wallet size={16} color="var(--primary-blue)" />
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Tipo do payload</span>
                                        </div>
                                        <div style={{ fontWeight: 700 }}>{pixExpenseDraft.payloadType || 'Nao informado'}</div>
                                    </div>
                                </div>

                                {pixFormError && (
                                    <div
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            background: 'rgba(244, 67, 54, 0.10)',
                                            color: '#C62828',
                                            fontSize: '0.86rem',
                                            fontWeight: 600
                                        }}
                                    >
                                        {pixFormError}
                                    </div>
                                )}

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                        gap: '12px'
                                    }}
                                >
                                    <button className="btn-primary" onClick={savePixExpense}>
                                        <Save size={18} /> Salvar despesa
                                    </button>
                                    <button
                                        className="glass-card"
                                        onClick={resetScannerState}
                                        style={{
                                            margin: 0,
                                            borderRadius: '14px',
                                            padding: '14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            color: '#D32F2F',
                                            background: 'rgba(255,255,255,0.92)',
                                            border: '1px solid rgba(211, 47, 47, 0.14)'
                                        }}
                                    >
                                        <X size={18} /> Cancelar
                                    </button>
                                </div>
                            </div>
                        </MotionDiv>
                    )}

                    {status === 'success' && (
                        <MotionDiv key="success" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <CheckCircle2 size={64} color="var(--success-emerald)" style={{ margin: '0 auto 20px' }} />
                            <h3 style={{ color: 'var(--success-emerald)' }}>{successMessage}</h3>
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
                            <button className="btn-primary" onClick={resetScannerState}>Tentar novamente</button>
                        </MotionDiv>
                    )}

                    {status === 'error' && (
                        <MotionDiv key="error" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <AlertCircle size={64} color="#f44336" style={{ margin: '0 auto 20px' }} />
                            <h4 style={{ color: '#f44336', marginBottom: '10px' }}>Ops! Erro na leitura</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '20px' }}>{errorMessage}</p>
                            <button className="btn-primary" onClick={resetScannerState}>Tentar novamente</button>
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
