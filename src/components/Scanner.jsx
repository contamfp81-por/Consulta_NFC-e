import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { Camera, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, success, error
    const [errorMessage, setErrorMessage] = useState('');
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);

    const loadCameras = async () => {
        try {
            // Request permission explicitly before listing
            await navigator.mediaDevices.getUserMedia({ video: true });

            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                setCameras(devices);

                // Smart auto-selection: try to find the "environment" or "back" camera
                const backCam = devices.find(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('traseira') ||
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                ) || devices[0];

                setSelectedCameraId(backCam.id);
            } else {
                setErrorMessage('Nenhuma câmera detectada no dispositivo.');
                setStatus('error');
            }
        } catch (err) {
            console.error("Erro ao buscar câmeras", err);
            setErrorMessage('Permissão de câmera negada ou bloqueada pelo navegador.');
            setStatus('error');
        }
    };

    useEffect(() => {
        loadCameras();
    }, []);

    const startScanner = async (cameraId) => {
        try {
            // If already initialized, stop it first
            if (scannerRef.current) {
                await stopScanner();
            }

            setStatus('scanning');
            const newScanner = new Html5Qrcode("reader");
            scannerRef.current = newScanner;

            await newScanner.start(
                cameraId,
                {
                    fps: 15,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const qrboxSize = Math.floor(minEdge * 0.7);
                        return { width: qrboxSize, height: qrboxSize };
                    },
                    aspectRatio: 1.0
                },
                async (decodedText) => {
                    await stopScanner();
                    handleQRCodeDecoded(decodedText);
                },
                () => { } // Scan errors are normal while looking for QR
            );
        } catch (err) {
            console.error("Erro ao iniciar scanner:", err);
            setStatus('error');
            setErrorMessage('Falha ao acessar esta câmera específica. Tente outra da lista.');
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (e) {
                console.error("Erro ao parar scanner:", e);
            }
            scannerRef.current = null;
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setStatus('processing');
        // Simple instance for file scanning
        const html5QrCode = new Html5Qrcode("reader-hidden");

        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            handleQRCodeDecoded(decodedText);
        } catch (err) {
            console.error("Erro ao ler QR Code da imagem:", err);
            setStatus('error');
            setErrorMessage('QR Code não encontrado. Garanta que a imagem esteja nítida e bem iluminada.');
        } finally {
            html5QrCode.clear();
        }
    };

    const handleQRCodeDecoded = async (url) => {
        setStatus('processing');
        try {
            const data = await processNFCeURL(url);

            if (data.accessKey) {
                const existing = await db.receipts.where('accessKey').equals(data.accessKey).first();
                if (existing) {
                    setStatus('error');
                    setErrorMessage('Este cupom fiscal já foi cadastrado anteriormente.');
                    return;
                }
            }

            const receiptId = await db.receipts.add({
                establishment: data.establishment,
                date: data.date,
                totalValue: data.totalValue,
                url: url,
                accessKey: data.accessKey,
                receiptNumber: data.receiptNumber,
                isPartial: data.isPartial
            });

            if (data.products && data.products.length > 0) {
                const productsWithIds = data.products.map(p => ({
                    ...p,
                    receiptId,
                    category: autoCategorize(p.name)
                }));
                await db.products.bulkAdd(productsWithIds);
            }

            setStatus('success');
            setTimeout(() => onComplete(), 2000);
        } catch (err) {
            console.error("Erro no processamento", err);
            setStatus('error');
            setErrorMessage('Robô não conseguiu extrair dados do site SEFAZ. Verifique sua internet.');
        }
    };

    return (
        <div className="animate-slide-up">
            {/* Element for hidden file processing */}
            <div id="reader-hidden" style={{ display: 'none' }}></div>

            <div className="glass-card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '15px' }}>Leitor NFC-e</h3>

                <AnimatePresence mode="wait">
                    {status === 'idle' && (
                        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '25px' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>
                                    Usar Câmera (Macro/Principal/Ultra)
                                </label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <select
                                        className="glass-card"
                                        style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'white', border: '1px solid #ddd', fontSize: '0.9rem' }}
                                        value={selectedCameraId}
                                        onChange={(e) => setSelectedCameraId(e.target.value)}
                                    >
                                        {cameras.map(cam => (
                                            <option key={cam.id} value={cam.id}>
                                                {cam.label || `Câmera ${cam.id}`}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={loadCameras}
                                        style={{ padding: '10px', borderRadius: '12px', background: '#f0f0f0', border: 'none', color: 'var(--primary-blue)' }}
                                        title="Atualizar lista de câmeras"
                                    >
                                        <RotateCw size={20} />
                                    </button>
                                </div>
                                <button className="btn-primary" onClick={() => startScanner(selectedCameraId)}>
                                    <Camera size={20} /> Abrir Scanner
                                </button>
                            </div>

                            <div style={{ padding: '20px 0', borderTop: '1px solid #eee' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>
                                    Importar de Foto/Galeria
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
                                    style={{ background: 'var(--white)', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)' }}
                                    onClick={() => fileInputRef.current.click()}
                                >
                                    <ImageIcon size={20} /> Selecionar Imagem
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {(status === 'scanning' || status === 'processing') && (
                        <motion.div key="loading" style={{ padding: '10px' }}>
                            <div id="reader" style={{ width: '100%', minHeight: '300px', borderRadius: '20px', overflow: 'hidden', background: '#000' }}></div>
                            <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                {status === 'processing' && <Loader2 className="animate-spin" size={40} color="var(--primary-blue)" />}
                                <p style={{ fontWeight: '500' }}>
                                    {status === 'scanning' ? 'Aponte para o QR Code...' : 'Processando dados...'}
                                </p>
                                <button
                                    onClick={async () => { await stopScanner(); setStatus('idle'); }}
                                    style={{ background: 'var(--bg-ice)', border: 'none', padding: '10px 20px', borderRadius: '10px', color: '#ff5252', fontWeight: 'bold' }}
                                >
                                    Cancelar / Voltar
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="success" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <CheckCircle2 size={64} color="var(--success-emerald)" />
                            <h3 style={{ color: 'var(--success-emerald)' }}>Importado!</h3>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="error" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <AlertCircle size={64} color="#f44336" />
                            <div style={{ textAlign: 'center' }}>
                                <h4 style={{ color: '#f44336', marginBottom: '10px' }}>Erro no Processo</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>{errorMessage}</p>
                            </div>
                            <button className="btn-primary" onClick={() => setStatus('idle')}>Tentar Novamente</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
