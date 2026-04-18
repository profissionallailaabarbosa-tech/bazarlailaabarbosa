import React, { useState, useEffect, useRef } from "react";
import { db, supabase } from "../api/supabase"; 
import { isTemporaryMediaUrl, sanitizeMediaList, sanitizeMediaUrl } from "../utils/media";
import { 
  Package, ShoppingBag, Settings, Plus, Trash, Image as ImageIcon, 
  CreditCard, Truck, Video, Users, Clock, AlignLeft, Check, Lock, Loader2, X, Search, Clipboard, AlertTriangle, Camera
} from "lucide-react";

// Botão Switch (Visual)
const Switch = ({ checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)} className={`w-10 h-5 rounded-full transition-colors relative ${checked ?'bg-green-500' : 'bg-gray-300'}`}>
    <div className={`w-3 h-3 bg-white rounded-full shadow-md absolute top-1 transition-all duration-300 ${checked ?'left-6' : 'left-1'}`} />
  </button>
);

export default function Admin() {
  const PENDING_EXPIRATION_HOURS = 2;
  const MAX_STORY_VIDEO_COUNT = 3;
  const MAX_RECORDING_SECONDS = 15;
  const ACCEPTED_STORY_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
  const categoryLabels = {
    vestidos: "Vestidos",
    conjuntos: "Conjuntos",
    blusas: "Blusas",
    saias: "Saias",
    calcas: "Calças",
  };
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [mediaRecoveryNotice, setMediaRecoveryNotice] = useState({ image: false, galleryCount: 0, storyCount: 0 });
  const [recordingStoryIndex, setRecordingStoryIndex] = useState(null);
  const [recordingError, setRecordingError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizingRecording, setIsFinalizingRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState("");

  // Estados de Upload
  const [imageFile, setImageFile] = useState(null); // Capa
  const [storyVideoFiles, setStoryVideoFiles] = useState(Array(MAX_STORY_VIDEO_COUNT).fill(null)); // Story / Vídeo
  const [galleryFiles, setGalleryFiles] = useState([]); // Galeria (Arquivos)
  const [galleryPreviews, setGalleryPreviews] = useState([]); // Galeria (Prévias Visuais)
  const [cameraReady, setCameraReady] = useState(false);

  const [form, setForm] = useState({ name: "", description: "", price: "", category: "vestidos", size: "", quantity: "1", image: null, video: "", storyVideos: Array(MAX_STORY_VIDEO_COUNT).fill(""), gallery: [], featured: false });
  const [config, setConfig] = useState({});
  const cameraVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingPreviewUrlRef = useRef("");
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStopTimeoutRef = useRef(null);
  const recordingFinalizeTimeoutRef = useRef(null);
  const isStoppingRecordingRef = useRef(false);

  const getProductStoryVideos = (product) => {
    const storyVideos = Array.isArray(product?.story_videos)
      ?product.story_videos
      : [];

    const legacyVideo = typeof product?.video === "string" ?product.video.trim() : "";

    return sanitizeMediaList([...storyVideos, legacyVideo]).slice(0, MAX_STORY_VIDEO_COUNT);
  };

  const getSupportedRecordingMimeType = () =>
    [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/quicktime",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";

  const resetProductForm = () => {
    if (form.image && isTemporaryMediaUrl(form.image)) URL.revokeObjectURL(form.image);
    (form.storyVideos || []).forEach((videoUrl) => {
      if (isTemporaryMediaUrl(videoUrl)) URL.revokeObjectURL(videoUrl);
    });
    galleryPreviews.forEach((previewUrl) => {
      if (isTemporaryMediaUrl(previewUrl)) URL.revokeObjectURL(previewUrl);
    });

    setEditingProductId(null);
    setMediaRecoveryNotice({ image: false, galleryCount: 0, storyCount: 0 });
    setForm({
      name: "",
      description: "",
      price: "",
      category: "vestidos",
      size: "",
      quantity: "1",
      image: null,
      video: "",
      storyVideos: Array(MAX_STORY_VIDEO_COUNT).fill(""),
      gallery: [],
      featured: false,
    });
    setImageFile(null);
    setStoryVideoFiles(Array(MAX_STORY_VIDEO_COUNT).fill(null));
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setUploadStatus("");
  };

  async function checkIsAdmin(userId) {
    if (!userId) return false;
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.user_id);
  }

  useEffect(() => {
    recordingPreviewUrlRef.current = recordingPreviewUrl;
  }, [recordingPreviewUrl]);

  useEffect(() => {
    let mounted = true;

    const applySession = async (session) => {
      if (!mounted) return;

      const isAdmin = await checkIsAdmin(session?.user?.id);

      if (session && isAdmin) {
        setIsAuthenticated(true);
        await Promise.all([loadData(), loadConfig()]);
      } else {
        setIsAuthenticated(false);
      }
      setAuthChecking(false);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data?.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await applySession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) return alert("Preencha email e senha.");

    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginData.email.trim(),
      password: loginData.password,
    });
    setAuthLoading(false);

    if (error) {
      alert("Login inválido.");
      return;
    }

    const isAdmin = await checkIsAdmin(data?.user?.id);
    if (!isAdmin) {
      await supabase.auth.signOut();
      alert("Este usuário não tem permissão de admin.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  async function loadData() {
    try {
      const prods = await db.products.list();
      setProducts(prods || []);
      const { data: ords } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      setOrders(ords || []);
    } catch (error) { console.error(error); }
  }

  async function loadConfig() {
    try {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (data) {
        setConfig({
          ...data,
          whatsapp_number: data.whatsapp_number || data.whatsapp || "",
        });
      }
    } catch (error) { console.log("Erro config", error); }
  }

  // --- UPLOAD CAPA ---
  const handleProductImage = (e) => { 
      const file = e.target.files[0]; 
      if (file) { 
          if (form.image && isTemporaryMediaUrl(form.image)) URL.revokeObjectURL(form.image);
          setImageFile(file); 
          setForm({ ...form, image: URL.createObjectURL(file) }); 
      }
  };

  // --- UPLOAD GALERIA (Múltiplas Fotos) ---
  const handleGalleryImages = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
          setGalleryFiles(prev => [...prev, ...files]);
          setGalleryPreviews(prev => [...prev, ...files.map((file) => URL.createObjectURL(file))]);
      }
  };

  const removeGalleryImage = (index) => {
      const previewToRemove = galleryPreviews[index];
      if (isTemporaryMediaUrl(previewToRemove)) URL.revokeObjectURL(previewToRemove);
      setGalleryFiles(prev => prev.filter((_, i) => i !== index));
      setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const removeStoryVideo = (index) => {
      const currentVideo = form.storyVideos?.[index];
      if (isTemporaryMediaUrl(currentVideo)) URL.revokeObjectURL(currentVideo);
      setStoryVideoFiles((prev) => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      setForm((prev) => {
        const nextVideos = [...(prev.storyVideos || Array(MAX_STORY_VIDEO_COUNT).fill(""))];
        nextVideos[index] = "";
        return {
          ...prev,
          video: nextVideos[0] || "",
          storyVideos: nextVideos,
        };
      });
  };

  const releaseCameraTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraReady(false);
  };

  const handleConfigBanner = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setConfig({ ...config, banner_image_url: reader.result }); reader.readAsDataURL(file); }};  const applyStoryFile = (index, file, previewUrl) => {
      setStoryVideoFiles((prev) => {
        const next = [...prev];
        next[index] = file;
        return next;
      });
      setForm((prev) => {
        const nextVideos = [...(prev.storyVideos || Array(MAX_STORY_VIDEO_COUNT).fill(""))];
        const previousPreview = nextVideos[index];
        if (isTemporaryMediaUrl(previousPreview)) URL.revokeObjectURL(previousPreview);
        nextVideos[index] = previewUrl;
        return {
          ...prev,
          video: nextVideos[0] || "",
          storyVideos: nextVideos,
        };
      });
  };

  const stopCameraStream = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingStopTimeoutRef.current) {
      window.clearTimeout(recordingStopTimeoutRef.current);
      recordingStopTimeoutRef.current = null;
    }
    if (recordingFinalizeTimeoutRef.current) {
      window.clearTimeout(recordingFinalizeTimeoutRef.current);
      recordingFinalizeTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    releaseCameraTracks();
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    isStoppingRecordingRef.current = false;
    setIsRecording(false);
  };

  const closeRecorder = () => {
    stopCameraStream();
    if (recordingPreviewUrl && isTemporaryMediaUrl(recordingPreviewUrl)) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setRecordingPreviewUrl("");
    setRecordingSeconds(0);
    setRecordingError("");
    setIsFinalizingRecording(false);
    setRecordingStoryIndex(null);
  };

  const startRecorder = async (index) => {
    try {
      stopCameraStream();
      setRecordingError("");
      if (recordingPreviewUrl && isTemporaryMediaUrl(recordingPreviewUrl)) {
        URL.revokeObjectURL(recordingPreviewUrl);
      }
      setRecordingPreviewUrl("");
      setRecordingSeconds(0);
      setIsFinalizingRecording(false);
      setRecordingStoryIndex(index);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          aspectRatio: { ideal: 9 / 16 },
          width: { ideal: 720, max: 1080 },
          height: { ideal: 1280, max: 1920 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setCameraReady(true);
    } catch (error) {
      console.error(error);
      setRecordingError("Não foi possível abrir a câmera. Verifique a permissão do navegador.");
      setRecordingStoryIndex(index);
    }
  };

  const beginRecording = () => {
    if (!mediaStreamRef.current || recordingStoryIndex === null || isRecording) return;
    const supportedMimeType = getSupportedRecordingMimeType();

    const recorder = new MediaRecorder(mediaStreamRef.current, supportedMimeType ? { mimeType: supportedMimeType } : undefined);
    mediaRecorderRef.current = recorder;
    recordingChunksRef.current = [];
    setRecordingSeconds(0);
    setRecordingPreviewUrl("");
    setIsFinalizingRecording(false);

    recorder.ondataavailable = (event) => {
      if (event.data?.size) recordingChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      isStoppingRecordingRef.current = false;
      setIsFinalizingRecording(false);
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (!blob.size) {
        setRecordingError("A gravação não gerou vídeo. Tente novamente.");
        return;
      }
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
      const recordedFile = new File([blob], `story-${Date.now()}.${extension}`, { type: blob.type || "video/webm" });
      const previewUrl = URL.createObjectURL(recordedFile);
      setRecordingPreviewUrl(previewUrl);
      setIsRecording(false);
      releaseCameraTracks();
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (recordingStopTimeoutRef.current) {
        window.clearTimeout(recordingStopTimeoutRef.current);
        recordingStopTimeoutRef.current = null;
      }
      if (recordingFinalizeTimeoutRef.current) {
        window.clearTimeout(recordingFinalizeTimeoutRef.current);
        recordingFinalizeTimeoutRef.current = null;
      }
    };

    recorder.start(250);
    setIsRecording(true);
    setRecordingError("");
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => {
        const next = Math.min(current + 1, MAX_RECORDING_SECONDS);
        return next;
      });
    }, 1000);
    recordingStopTimeoutRef.current = window.setTimeout(() => {
      stopRecording(true);
    }, MAX_RECORDING_SECONDS * 1000);
  };

  const stopRecording = (autoStop = false) => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingStopTimeoutRef.current) {
      window.clearTimeout(recordingStopTimeoutRef.current);
      recordingStopTimeoutRef.current = null;
    }

    if (autoStop) {
      setRecordingSeconds(MAX_RECORDING_SECONDS);
    }

    if (isStoppingRecordingRef.current) return;
    if (mediaRecorderRef.current?.state === "recording") {
      isStoppingRecordingRef.current = true;
      setIsRecording(false);
      setIsFinalizingRecording(true);
      try {
        mediaRecorderRef.current.requestData?.();
      } catch {
        // Alguns navegadores não suportam requestData de forma estável.
      }
      mediaRecorderRef.current.stop();
      if (autoStop) {
        releaseCameraTracks();
      }
      recordingFinalizeTimeoutRef.current = window.setTimeout(() => {
        if (!recordingPreviewUrlRef.current) {
          setIsFinalizingRecording(false);
          isStoppingRecordingRef.current = false;
          setRecordingError("A gravação demorou mais do que o esperado para finalizar. Toque em gravar outro para tentar novamente.");
        }
      }, 2500);
      if (autoStop) {
        setRecordingError("Tempo máximo atingido. Preparando a tela de revisão do story.");
      }
    }
  };

  const useRecordedStory = () => {
    if (!recordingPreviewUrl || recordingStoryIndex === null) return;
    fetch(recordingPreviewUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
        const recordedFile = new File([blob], `story-${Date.now()}.${extension}`, { type: blob.type || "video/webm" });
        applyStoryFile(recordingStoryIndex, recordedFile, recordingPreviewUrl);
        setRecordingPreviewUrl("");
        setRecordingStoryIndex(null);
        setRecordingSeconds(0);
        setRecordingError("");
        setIsFinalizingRecording(false);
      stopCameraStream();
      })
      .catch((error) => {
        console.error(error);
        setRecordingError("Não foi possível salvar a gravação. Tente novamente.");
      });
  };

  const restartRecorder = async () => {
    if (recordingStoryIndex === null) return;
    if (recordingPreviewUrl && isTemporaryMediaUrl(recordingPreviewUrl)) {
      URL.revokeObjectURL(recordingPreviewUrl);
    }
    setRecordingPreviewUrl("");
    setRecordingSeconds(0);
    setRecordingError("");
    setIsFinalizingRecording(false);
    await startRecorder(recordingStoryIndex);
  };

  useEffect(() => {
    if (!cameraReady || !cameraVideoRef.current || !mediaStreamRef.current) return;
    cameraVideoRef.current.srcObject = mediaStreamRef.current;
    cameraVideoRef.current.muted = true;
    cameraVideoRef.current.playsInline = true;
    const playPromise = cameraVideoRef.current.play?.();
    playPromise?.catch?.(() => {});
  }, [cameraReady, recordingStoryIndex]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (recordingStopTimeoutRef.current) {
        window.clearTimeout(recordingStopTimeoutRef.current);
      }
      if (recordingFinalizeTimeoutRef.current) {
        window.clearTimeout(recordingFinalizeTimeoutRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleProductVideo = (index, e) => {
      const file = e.target.files[0];
      if (file) {
          if (!ACCEPTED_STORY_VIDEO_TYPES.includes(file.type)) {
            alert("Use MP4, MOV ou WebM para os stories.");
            return;
          }
          applyStoryFile(index, file, URL.createObjectURL(file));
      }
  };

  // --- FUNÇÃO AUXILIAR DE UPLOAD ---
  const uploadFileToSupabase = async (file, folder = "produtos") => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
      
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
      
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      return data.publicUrl;
  };

  // --- SALVAR PRODUTO ---
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) return alert("Preencha nome e preço!");
    
    setLoading(true);
    setUploadStatus("Preparando cadastro...");
    try {
      let finalImageUrl = sanitizeMediaUrl(form.image);
      let finalStoryVideos = [...(form.storyVideos || Array(MAX_STORY_VIDEO_COUNT).fill(""))];

      if (!imageFile && form.image && !finalImageUrl) {
        throw new Error("A capa atual precisa ser enviada novamente. Escolha a imagem de capa antes de salvar.");
      }

      const temporaryStoryNeedsReupload = finalStoryVideos.some(
        (url, index) => isTemporaryMediaUrl(url) && !storyVideoFiles[index]
      );
      if (temporaryStoryNeedsReupload) {
        throw new Error("Um dos stories atuais está só em prévia local. Envie o vídeo novamente antes de salvar.");
      }

      const temporaryGalleryCount = galleryPreviews.filter((url) => isTemporaryMediaUrl(url)).length;
      if (temporaryGalleryCount > galleryFiles.length) {
        throw new Error("Uma ou mais fotos da galeria precisam ser enviadas novamente antes de salvar.");
      }
      
      // 1. Sobe Capa
      if (imageFile) {
          try {
             setUploadStatus("Subindo capa...");
             finalImageUrl = await uploadFileToSupabase(imageFile, "produtos/capa");
          } catch (err) {
             alert("Erro ao subir capa. Verifique se o bucket 'images' existe e é público.");
             throw err;
          }
      }

      // 2. Sobe Stories / Vídeos
      for (let index = 0; index < storyVideoFiles.length; index += 1) {
          const storyFile = storyVideoFiles[index];
          if (!storyFile) continue;
          try {
             setUploadStatus(`Subindo story ${index + 1}...`);
             finalStoryVideos[index] = await uploadFileToSupabase(storyFile, "produtos/videos");
          } catch (err) {
             alert(`Erro ao subir vídeo ${index + 1}.`);
             throw err;
          }
      }

      // 3. Sobe Galeria
      let finalGalleryUrls = sanitizeMediaList(galleryPreviews);
      if (galleryFiles.length > 0) {
          try {
             setUploadStatus("Subindo galeria...");
             const uploadedGallery = await Promise.all(galleryFiles.map(file => uploadFileToSupabase(file, "produtos/galeria")));
             finalGalleryUrls = [...finalGalleryUrls, ...uploadedGallery];
          } catch (err) {
             alert("Erro ao subir galeria.");
             throw err;
          }
      }

      const precoLimpo = form.price.toString().replace(',', '.');
      
      const normalizedStoryVideos = sanitizeMediaList(finalStoryVideos).slice(0, MAX_STORY_VIDEO_COUNT);

      const productData = {
        name: form.name,
        description: form.description || "",
        price: parseFloat(precoLimpo) || 0,
        category: form.category,
        size: form.size,
        quantity: parseInt(form.quantity) || 1,
        image: finalImageUrl,
        video: normalizedStoryVideos[0] || null,
        story_videos: normalizedStoryVideos,
        gallery: finalGalleryUrls.length > 0 ?finalGalleryUrls : null,
        featured: form.featured || false
      };

      setUploadStatus("Salvando produto...");
      const query = editingProductId
        ? supabase.from('products').update(productData).eq('id', editingProductId)
        : supabase.from('products').insert([productData]);
      const { error } = await query;

      if (error) throw error;
      
      alert(editingProductId ? "Produto atualizado com sucesso!" : "Produto e fotos salvos com sucesso!");
      resetProductForm();
      loadData();

    } catch (error) { 
        console.error(error);
        alert("Erro ao salvar: " + (error.message || "Erro desconhecido")); 
    } finally { 
        setUploadStatus("");
        setLoading(false); 
    }
  };

  const handleDeleteProduct = async (id) => { if (confirm("Apagar?")) { await db.products.delete(id); loadData(); }};
  const handleEditProduct = (product) => {
    resetProductForm();
    const rawGallery = Array.isArray(product.gallery) ? product.gallery : [];
    const rawStoryVideos = [
      ...(Array.isArray(product.story_videos) ? product.story_videos : []),
      typeof product.video === "string" ? product.video.trim() : "",
    ].filter(Boolean);
    setMediaRecoveryNotice({
      image: Boolean(product.image && !sanitizeMediaUrl(product.image)),
      galleryCount: rawGallery.filter((url) => !sanitizeMediaUrl(url)).length,
      storyCount: rawStoryVideos.filter((url) => !sanitizeMediaUrl(url)).length,
    });
    const storyVideos = getProductStoryVideos(product);
    const filledStoryVideos = [
      ...storyVideos,
      ...Array(Math.max(0, MAX_STORY_VIDEO_COUNT - storyVideos.length)).fill(""),
    ].slice(0, MAX_STORY_VIDEO_COUNT);

    setEditingProductId(product.id);
    setForm({
      name: product.name || "",
      description: product.description || "",
      price: String(product.price ?? ""),
      category: product.category || "vestidos",
      size: product.size || "",
      quantity: String(product.quantity ?? "1"),
        image: sanitizeMediaUrl(product.image) || null,
        video: filledStoryVideos[0] || "",
        storyVideos: filledStoryVideos,
        gallery: sanitizeMediaList(product.gallery || []),
        featured: !!product.featured,
      });
    setGalleryPreviews(sanitizeMediaList(product.gallery || []));
    setStoryVideoFiles(Array(MAX_STORY_VIDEO_COUNT).fill(null));
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const updateOrderStatus = async (id, newStatus) => {
    try {
      await supabase.from('orders').update({ status: newStatus }).eq('id', id);
      loadData();
    } catch {
      alert("Erro ao atualizar");
    }
  };

  const normalizeOrderValue = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const getPaymentBadgeClass = (paymentStatus) => {
    const normalized = normalizeOrderValue(paymentStatus);
    if (normalized === "approved") return "bg-green-100 text-green-700";
    if (["rejected", "cancelled", "charged_back"].includes(normalized)) return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  const isExpiredPendingOrder = (order) => {
    const paymentStatus = normalizeOrderValue(order?.payment_status);
    if (paymentStatus === "approved") return false;
    if (!order?.created_at) return false;
    const createdAt = new Date(order.created_at).getTime();
    if (Number.isNaN(createdAt)) return false;
    return Date.now() - createdAt >= PENDING_EXPIRATION_HOURS * 60 * 60 * 1000;
  };

  const getDisplayPaymentStatus = (order) => {
    if (isExpiredPendingOrder(order)) return "Expirado";
    return order?.payment_status || "Sem pagamento";
  };

  const getStatusBadgeClass = (status) => {
    const normalized = normalizeOrderValue(status);
    if (normalized === "pago" || normalized === "entregue") return "bg-green-100 text-green-700";
    if (normalized === "enviado") return "bg-blue-100 text-blue-700";
    if (normalized.includes("recusado")) return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-700";
  };

  const filteredOrders = orders.filter((order) => {
    const search = normalizeOrderValue(orderSearch);
    const matchesSearch =
      !search ||
      normalizeOrderValue(order.id).includes(search) ||
      normalizeOrderValue(order.customer_name).includes(search) ||
      normalizeOrderValue(order.customer_phone).includes(search);

    if (!matchesSearch) return false;
    if (orderFilter === "all") return !isExpiredPendingOrder(order);
    if (orderFilter === "paid") return normalizeOrderValue(order.payment_status) === "approved";
    if (orderFilter === "pending") {
      return normalizeOrderValue(order.payment_status) !== "approved" && !isExpiredPendingOrder(order);
    }
    if (orderFilter === "expired") return isExpiredPendingOrder(order);
    if (orderFilter === "sent") return normalizeOrderValue(order.status) === "enviado";
    if (orderFilter === "delivered") return normalizeOrderValue(order.status) === "entregue";
    return true;
  });

  const filteredProducts = products.filter((product) => {
    const search = normalizeOrderValue(productSearch);
    const matchesSearch =
      !search ||
      normalizeOrderValue(product.name).includes(search) ||
      normalizeOrderValue(product.category).includes(search) ||
      normalizeOrderValue(product.size).includes(search);

    if (!matchesSearch) return false;
    if (productFilter === "all") return true;
    if (productFilter === "available") return Number(product.quantity || 0) > 0;
    if (productFilter === "sold_out") return Number(product.quantity || 0) <= 0;
    if (productFilter === "featured") return Boolean(product.featured);
    if (productFilter === "stories") return getProductStoryVideos(product).length > 0;
    return true;
  });

  const orderSummary = {
    total: orders.filter((order) => !isExpiredPendingOrder(order)).length,
    pending: orders.filter((order) => normalizeOrderValue(order.payment_status) !== "approved" && !isExpiredPendingOrder(order)).length,
    paid: orders.filter((order) => normalizeOrderValue(order.payment_status) === "approved").length,
    sent: orders.filter((order) => normalizeOrderValue(order.status) === "enviado").length,
  };

  const productSummary = {
    total: products.length,
    available: products.filter((product) => Number(product.quantity || 0) > 0).length,
    stories: products.filter((product) => getProductStoryVideos(product).length > 0).length,
    soldOut: products.filter((product) => Number(product.quantity || 0) <= 0).length,
  };

  const copyToClipboard = async (label, value) => {
    if (!value) {
      alert(`${label} não informado.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(String(value));
      alert(`${label} copiado.`);
    } catch {
      alert(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  };

  const canAdvanceOrder = (order) => normalizeOrderValue(order.payment_status) === "approved";
  
  // --- SALVAR CONFIGURAÇÕES ---
  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const { id: _configId, ...configData } = config;
      const whatsappNumber = configData.whatsapp_number || configData.whatsapp || "";
      const payload = {
        ...configData,
        whatsapp_number: whatsappNumber,
        whatsapp: whatsappNumber,
      };
      const { error } = await supabase.from('settings').update(payload).eq('id', 1);
      if (error) throw error;
      alert("Configurações salvas com sucesso!");
    } catch (err) { 
        console.error(err);
        alert("Erro ao salvar config: " + err.message); 
    } finally { 
        setSavingConfig(false); 
    }
  };

  if (authChecking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Verificando sessão...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100 text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Restrito</h1>
          <input
            type="email"
            placeholder="Email admin"
            className="w-full p-4 border rounded-xl mb-3"
            value={loginData.email}
            onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Senha"
            className="w-full p-4 border rounded-xl mb-4"
            value={loginData.password}
            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
          />
          <button disabled={authLoading} className="w-full bg-rose-500 text-white font-bold py-4 rounded-xl disabled:opacity-70">
            {authLoading ?"Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-700 pb-20 animate-in fade-in">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <h1 className="text-xl font-bold text-rose-500">Painel Admin</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setActiveTab("products")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "products" ?"bg-rose-500 text-white" : "bg-gray-100"}`}>Produtos</button>
          <button onClick={() => setActiveTab("orders")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "orders" ?"bg-rose-500 text-white" : "bg-gray-100"}`}>Pedidos</button>
          <button onClick={() => setActiveTab("config")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "config" ?"bg-rose-500 text-white" : "bg-gray-100"}`}>Configurações</button>
          <button onClick={handleLogout} className="ml-2 px-3 py-2 rounded-full border border-gray-200 text-red-500 hover:bg-red-50">Sair</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {activeTab === "products" && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-24">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold flex items-center gap-2 text-rose-500">
                    <Plus size={16}/> {editingProductId ? "Editar Produto" : "Novo Lookinho"}
                  </h2>
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={resetProductForm}
                      className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
                    >
                      Cancelar edição
                    </button>
                  )}
                </div>
                <form onSubmit={handleSaveProduct} className="space-y-3">
                  {editingProductId && (mediaRecoveryNotice.image || mediaRecoveryNotice.galleryCount > 0 || mediaRecoveryNotice.storyCount > 0) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800">
                      <p className="font-bold uppercase tracking-[0.16em] text-amber-700">Reenviar mídia deste produto</p>
                      <p className="mt-1">
                        Este produto tem arquivo antigo que não abre mais em outros aparelhos. Antes de salvar, reenvie o que estiver faltando abaixo.
                      </p>
                      {mediaRecoveryNotice.image && <p className="mt-2">Capa: reenviar 1 imagem principal.</p>}
                      {mediaRecoveryNotice.galleryCount > 0 && <p className="mt-1">Galeria: reenviar {mediaRecoveryNotice.galleryCount} {mediaRecoveryNotice.galleryCount === 1 ? "foto" : "fotos"}.</p>}
                      {mediaRecoveryNotice.storyCount > 0 && <p className="mt-1">Stories: reenviar {mediaRecoveryNotice.storyCount} {mediaRecoveryNotice.storyCount === 1 ? "vídeo" : "vídeos"}.</p>}
                    </div>
                  )}
                   
                  {/* FOTO DE CAPA */}
                  <div className="w-full aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center hover:bg-gray-50 cursor-pointer relative overflow-hidden bg-gray-50">
                    {form.image ?<img src={form.image} className="w-full h-full object-cover" /> : <div className="text-center text-gray-400"><ImageIcon className="w-8 h-8 mx-auto mb-2"/><span className="text-xs font-bold">Capa Principal</span></div>}
                    <input type="file" accept="image/*" onChange={handleProductImage} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                  {editingProductId && mediaRecoveryNotice.image && !form.image && (
                    <p className="text-[11px] font-bold text-amber-700">Reenvie a capa deste produto antes de salvar.</p>
                  )}
                  {form.image && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isTemporaryMediaUrl(form.image)) URL.revokeObjectURL(form.image);
                        setForm((prev) => ({ ...prev, image: null }));
                        setImageFile(null);
                      }}
                      className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-100"
                    >
                      Remover capa
                    </button>
                  )}

                  {/* GALERIA */}
                  <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2">Galeria (Várias Fotos)</label>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                          {galleryPreviews.map((src, i) => (
                              <div key={i} className="aspect-square relative rounded overflow-hidden border">
                                  <img src={src} className="w-full h-full object-cover" />
                                  <button type="button" onClick={() => removeGalleryImage(i)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl"><X size={10}/></button>
                              </div>
                          ))}
                          <div className="aspect-square border-2 border-dashed rounded flex items-center justify-center hover:bg-gray-50 relative cursor-pointer">
                              <Plus size={20} className="text-gray-400"/>
                              <input type="file" multiple accept="image/*" onChange={handleGalleryImages} className="absolute inset-0 opacity-0 cursor-pointer" />
                          </div>
                      </div>
                      <p className="text-[10px] text-gray-400">Clique no + para adicionar extras. Em edição, você pode apagar fotos antigas sem recadastrar o produto.</p>
                      {editingProductId && mediaRecoveryNotice.galleryCount > 0 && galleryPreviews.length === 0 && (
                        <p className="text-[11px] font-bold text-amber-700">Reenvie as fotos da galeria que estavam quebradas antes de salvar.</p>
                      )}
                  </div>

                  <input placeholder="Nome" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                  <textarea rows="3" placeholder="Descrição..." className="w-full p-2 bg-gray-50 rounded text-sm resize-none border border-gray-200" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                  <div className="grid grid-cols-3 gap-2">
                    <input placeholder="R$" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
                    <input placeholder="Tam" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.size} onChange={e => setForm({...form, size: e.target.value})} />
                    <input type="number" placeholder="Qtd" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                  </div>
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      <Video size={16} className="text-rose-500" /> Aparecer nos stories da vitrine
                    </div>
                    {Array.from({ length: MAX_STORY_VIDEO_COUNT }, (_, index) => {
                      const currentVideo = form.storyVideos?.[index] || "";
                      return (
                        <div key={index} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                              Story {index + 1}{index === 0 ?" principal" : index === 1 ?" extra" : " apoio"}
                            </span>
                            {currentVideo && (
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
                                  Preview
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeStoryVideo(index)}
                                  className="rounded-full border border-red-200 px-2 py-1 text-[10px] font-bold uppercase text-red-500 hover:bg-red-50"
                                >
                                  Apagar
                                </button>
                              </div>
                            )}
                          </div>

                          {currentVideo && (
                            <video
                              src={currentVideo}
                              controls
                              muted
                              playsInline
                              preload="metadata"
                              className="h-44 w-full rounded-lg bg-black object-cover"
                            />
                          )}
                          {editingProductId && mediaRecoveryNotice.storyCount > 0 && !currentVideo && (
                            <p className="text-[11px] font-bold text-amber-700">
                              Este slot precisa de um vídeo novo para voltar a abrir no celular e no computador.
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => startRecorder(index)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100"
                          >
                            <Camera size={14} /> {currentVideo ? "Gravar novamente no site" : "Gravar story no site"}
                          </button>

                          <input
                            type="file"
                            accept="video/*"
                            onChange={(e) => handleProductVideo(index, e)}
                            className="w-full text-xs text-gray-500 file:mr-2 file:rounded-full file:border file:border-gray-200 file:bg-white file:px-3 file:py-1 file:text-xs hover:file:bg-gray-100"
                          />
                          <input
                            placeholder={
                              index === 0
                                ? "ou cole a URL pública do story principal"
                                : index === 1
                                  ? "ou cole a URL pública do story extra"
                                  : "ou cole a URL pública do story de apoio"
                            }
                            className="w-full rounded border border-gray-200 bg-white p-2 text-sm"
                            value={currentVideo}
                            onChange={(e) =>
                              setForm((prev) => {
                                const nextVideos = [...(prev.storyVideos || Array(MAX_STORY_VIDEO_COUNT).fill(""))];
                                nextVideos[index] = e.target.value;
                                return {
                                  ...prev,
                                  video: nextVideos[0] || "",
                                  storyVideos: nextVideos,
                                };
                              })
                            }
                          />
                        </div>
                      );
                    })}
                    <div className="space-y-1 text-[10px] text-gray-400">
                      <p>Você pode subir até 3 vídeos por peça. Se existir pelo menos 1 vídeo aqui, a peça entra automaticamente na faixa de stories.</p>
                      <p><span className="font-semibold text-gray-500">Ideal:</span> 1080p, de 8 a 15 segundos, até 5 MB.</p>
                      <p><span className="font-semibold text-gray-500">Dica:</span> se a internet estiver ruim, cadastre primeiro com 1 ou 2 stories e adicione o restante depois.</p>
                      <p><span className="font-semibold text-gray-500">Gravação no site:</span> o story já sai com limite de 15 segundos para facilitar o cadastro.</p>
                    </div>
                  </div>
                  <select className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded p-3">
                    <input
                      type="checkbox"
                      checked={!!form.featured}
                      onChange={e => setForm({ ...form, featured: e.target.checked })}
                    />
                    Destacar na vitrine
                  </label>
                  {uploadStatus && (
                    <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700">
                      {uploadStatus}
                    </div>
                  )}
                  <button disabled={loading} className="w-full bg-rose-500 text-white font-bold py-2 rounded hover:bg-rose-600 text-sm flex justify-center items-center disabled:cursor-not-allowed disabled:opacity-70">
                    {loading ?<Loader2 className="animate-spin w-5 h-5"/> : editingProductId ? "Salvar alterações" : "Cadastrar Produto"}
                  </button>
                </form>
              </div>
            </div>
            
            <div className="lg:col-span-2 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Produtos</p>
                  <p className="text-2xl font-bold text-gray-800 mt-2">{productSummary.total}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Disponíveis</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-2">{productSummary.available}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Stories</p>
                  <p className="text-2xl font-bold text-gray-800 mt-2">{productSummary.stories}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Esgotados</p>
                  <p className="text-2xl font-bold text-red-500 mt-2">{productSummary.soldOut}</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar por nome, categoria ou tamanho"
                    className="w-full p-3 pl-10 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  className="p-3 rounded-lg border border-gray-200 text-sm md:w-52"
                >
                  <option value="all">Todos</option>
                  <option value="available">Disponíveis</option>
                  <option value="sold_out">Esgotados</option>
                  <option value="stories">Com stories</option>
                  <option value="featured">Destaques</option>
                </select>
              </div>

              {filteredProducts.map(p => (
                <div key={p.id} className="bg-white p-4 rounded-lg border border-gray-100 flex gap-3 items-center shadow-sm">
                  <img src={sanitizeMediaUrl(p.image) || "https://placehold.co/50"} className="w-14 h-14 rounded object-cover bg-gray-100" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-800 text-sm">{p.name}</h3>
                      {p.featured && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-1 rounded-full font-bold">Destaque</span>}
                      {getProductStoryVideos(p).length > 0 && (
                        <span className="text-[10px] bg-gray-900 text-white px-2 py-1 rounded-full font-bold">
                          {getProductStoryVideos(p).length === 1 ? "1 story" : `${getProductStoryVideos(p).length} stories`}
                        </span>
                      )}
                      {Number(p.quantity || 0) <= 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded-full font-bold">Esgotado</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {categoryLabels[p.category] || p.category || "Sem categoria"} {p.size ?`| Tam ${p.size}` : ""} {p.gallery ?`| +${p.gallery.length} fotos` : ""}
                    </p>
                    <p className="text-xs text-gray-500">Estoque: {Number(p.quantity || 0)}</p>
                    <p className="text-rose-500 font-bold text-sm">R$ {p.price}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditProduct(p)}
                      className="rounded-full border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
                    >
                      Editar
                    </button>
                    <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash size={16}/></button>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="bg-white p-8 rounded-lg border border-gray-100 text-center text-gray-400 shadow-sm">
                  Nenhum produto encontrado nesse filtro.
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === "orders" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button onClick={() => setOrderFilter("all")} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-left">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Pedidos</p>
                  <p className="text-2xl font-bold text-gray-800 mt-2">{orderSummary.total}</p>
                </button>
                <button onClick={() => setOrderFilter("pending")} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-left">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Pendentes</p>
                  <p className="text-2xl font-bold text-amber-600 mt-2">{orderSummary.pending}</p>
                </button>
                <button onClick={() => setOrderFilter("paid")} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-left">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Pagos</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-2">{orderSummary.paid}</p>
                </button>
                <button onClick={() => setOrderFilter("sent")} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-left">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-bold">Enviados</p>
                  <p className="text-2xl font-bold text-blue-600 mt-2">{orderSummary.sent}</p>
                </button>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Buscar por pedido, nome ou WhatsApp"
                    className="w-full p-3 pl-10 rounded-lg border border-gray-200 text-sm"
                  />
                </div>
                <select
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                  className="p-3 rounded-lg border border-gray-200 text-sm md:w-56"
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pagamento pendente</option>
                  <option value="expired">Pendentes expirados</option>
                  <option value="paid">Pagamento aprovado</option>
                  <option value="sent">Enviados</option>
                  <option value="delivered">Entregues</option>
                </select>
              </div>

              {filteredOrders.length === 0 ?(
                <div className="bg-white p-8 rounded text-center text-gray-400">Nenhum pedido encontrado.</div>
              ) : (
                filteredOrders.map((order) => (
                  <div key={order.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-base text-gray-800">Pedido #{order.id}</h3>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${getStatusBadgeClass(order.status)}`}>
                            {order.status || "Sem status"}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${getPaymentBadgeClass(order.payment_status)}`}>
                            {getDisplayPaymentStatus(order)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 font-medium">{order.customer_name || "Cliente sem nome"}</p>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p>WhatsApp: {order.customer_phone || "Não informado"}</p>
                            <button
                              type="button"
                              onClick={() => copyToClipboard("WhatsApp", order.customer_phone)}
                              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-200"
                            >
                              <Clipboard size={12} />
                              copiar
                            </button>
                          </div>
                          <p>Entrega: {String(order.delivery_method || "Não informado").replace("_", " ")}</p>
                          <p>Pagamento: {order.payment_method || "Não informado"}</p>
                          <p>Criado em: {order.created_at ?new Date(order.created_at).toLocaleString("pt-BR") : "Sem data"}</p>
                        </div>
                      </div>

                      <div className="md:text-right space-y-2">
                        <p className="font-bold text-rose-500 text-lg">R$ {Number(order.total_amount || 0).toFixed(2)}</p>
                        {!canAdvanceOrder(order) && (
                          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 border border-amber-200">
                            <AlertTriangle size={12} />
                            {isExpiredPendingOrder(order) ?"Pagamento não concluído" : "Aguarde confirmação do pagamento"}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            onClick={() => updateOrderStatus(order.id, 'Aguardando Separacao')}
                            disabled={!canAdvanceOrder(order)}
                            className="text-xs bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Separar
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'Enviado')}
                            disabled={!canAdvanceOrder(order)}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Enviado
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'Entregue')}
                            disabled={!canAdvanceOrder(order)}
                            className="text-xs bg-green-50 text-green-600 px-3 py-2 rounded-lg hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Entregue
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Endereço</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-line">
                          {order.address || "Endereço não informado"}
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">Itens</h4>
                        <div className="space-y-2">
                          {(order.items || []).map((item, idx) => (
                            <div key={`${order.id}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="font-medium text-gray-800">{item.name || "Produto"}</p>
                                <p className="text-xs text-gray-500">
                                  Qtd: {item.quantitySelected || item.quantity || 1}
                                  {item.size ?` | Tam: ${item.size}` : ""}
                                </p>
                              </div>
                              <span className="font-bold text-gray-700">
                                R$ {Number(item.price || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
        )}

        {/* ABA CONFIGURAÇÕES COMPLETA */}
        {activeTab === "config" && (
          <div className="space-y-5 animate-in fade-in max-w-3xl mx-auto">
            
            {/* Banner e Whats */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
               <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><Settings size={16} className="text-rose-500"/> Geral</h2>
               <div className="space-y-3">
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">Banner Principal</label>
                    <div className="border border-gray-200 rounded p-2 flex items-center gap-3 bg-gray-50">
                       {config.banner_image_url && <img src={config.banner_image_url} className="h-12 w-20 object-cover rounded" />}
                       <input type="file" onChange={handleConfigBanner} className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-full file:bg-white file:border file:border-gray-200 file:text-xs hover:file:bg-gray-100 cursor-pointer"/>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">Aqui é onde você troca a capa principal da loja.</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">WhatsApp da loja</label>
                   <input className="w-full p-2 border border-gray-200 rounded text-sm" placeholder="Ex: 5511999999999" value={config.whatsapp_number || ""} onChange={e => setConfig({...config, whatsapp_number: e.target.value})} />
                   <p className="mt-2 text-[11px] text-gray-400">Use o número com DDI e DDD. É ele que vai para botão flutuante, rodapé e checkout.</p>
                 </div>
               </div>
            </div>

             {/* Pagamentos */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><CreditCard size={16} className="text-rose-500"/> Pagamentos</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                     <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">PIX</span><Switch checked={config.enable_pix} onChange={c => setConfig({...config, enable_pix: c})} /></div>
                     {config.enable_pix && (
                         <div className="space-y-2">
                             <input className="w-full p-2 border border-gray-200 rounded text-xs" placeholder="Chave PIX" value={config.pix_key} onChange={e => setConfig({...config, pix_key: e.target.value})} />
                             <p className="text-[11px] leading-relaxed text-gray-500">O PIX é gerado pelo Mercado Pago. Essa chave só serve como referência interna, se você quiser manter anotada aqui.</p>
                         </div>
                     )}
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                     <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Cartão</span><Switch checked={config.enable_credit_card} onChange={c => setConfig({...config, enable_credit_card: c})} /></div>
                    {config.enable_credit_card && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
                        O cartão usa o mesmo checkout do Mercado Pago automaticamente. Você não precisa colar link manual aqui.
                       </div>
                     )}
                   </div>
                 </div>
             </div>

             {/* Entrega */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
               <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><Truck size={16} className="text-rose-500"/> Entregas</h2>
               <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                     <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Correios</span><Switch checked={config.enable_shipping_calc} onChange={c => setConfig({...config, enable_shipping_calc: c})} /></div>
                     {config.enable_shipping_calc && (<div className="grid grid-cols-2 gap-2"><input className="col-span-2 p-2 border border-gray-200 rounded text-xs" placeholder="CEP Origem" value={config.shipping_origin_cep} onChange={e => setConfig({...config, shipping_origin_cep: e.target.value})} /><input className="p-2 border border-gray-200 rounded text-xs" type="number" placeholder="Local R$" value={config.shipping_local_price} onChange={e => setConfig({...config, shipping_local_price: e.target.value})} /><input className="p-2 border border-gray-200 rounded text-xs" type="number" placeholder="Nacional R$" value={config.shipping_national_price} onChange={e => setConfig({...config, shipping_national_price: e.target.value})} /></div>)}
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Uber/99</span><Switch checked={config.enable_uber} onChange={c => setConfig({...config, enable_uber: c})} /></div>
                      {config.enable_uber && <p className="text-[11px] leading-relaxed text-gray-500">A cliente combina essa entrega pelo WhatsApp depois do pagamento.</p>}
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-xs">Retirada</span><Switch checked={config.enable_pickup} onChange={c => setConfig({...config, enable_pickup: c})} />
                  </div>
               </div>
            </div>

            <div className="sticky bottom-4">
              <button onClick={handleSaveConfig} disabled={savingConfig} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all text-sm">{savingConfig ?"Salvando..." : "Salvar Configurações"}</button>
            </div>
          </div>
        )}

        {recordingStoryIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-3 pt-4 sm:px-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-400">
                    {recordingPreviewUrl ? "Revisar story" : isFinalizingRecording ? "Finalizando" : "Gravar no site"}
                  </p>
                  <h3 className="text-lg font-bold text-gray-800">
                    {recordingPreviewUrl
                      ? `Story ${recordingStoryIndex + 1} pronto para salvar`
                      : isFinalizingRecording
                        ? `Story ${recordingStoryIndex + 1} em processamento`
                        : `Story ${recordingStoryIndex + 1}`}
                  </h3>
                </div>
                <button type="button" onClick={closeRecorder} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
              <div className="mx-auto max-h-[52vh] overflow-hidden rounded-[1.5rem] bg-black">
                {recordingPreviewUrl ? (
                  <video
                    src={recordingPreviewUrl}
                    controls
                    playsInline
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="aspect-[9/16] w-full object-cover"
                  />
                )}
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tempo máximo: {MAX_RECORDING_SECONDS}s</span>
                  <span>{recordingSeconds}s</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-all"
                    style={{ width: `${Math.min(100, (recordingSeconds / MAX_RECORDING_SECONDS) * 100)}%` }}
                  />
                </div>
                {recordingPreviewUrl && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                    Seu story está pronto. Agora você pode salvar este vídeo no produto ou gravar outro antes de continuar.
                  </div>
                )}
                {isFinalizingRecording && !recordingPreviewUrl && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                    Finalizando o vídeo para abrir a tela de revisão. Isso leva só um instante.
                  </div>
                )}
                {!recordingPreviewUrl && (
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    A gravação para sozinha quando chega no limite. Depois você revisa e decide se quer usar ou gravar de novo.
                  </p>
                )}
                {recordingError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {recordingError}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {!recordingPreviewUrl && !isRecording && !isFinalizingRecording && (
                    <button type="button" onClick={beginRecording} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold text-white hover:bg-rose-600">
                      Iniciar gravação
                    </button>
                  )}
                  {isRecording && (
                    <button type="button" onClick={stopRecording} className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white hover:bg-gray-800">
                      Parar gravação
                    </button>
                  )}
                  {isFinalizingRecording && !recordingPreviewUrl && (
                    <button type="button" disabled className="rounded-xl bg-gray-200 px-4 py-3 text-sm font-bold text-gray-500">
                      Preparando prévia...
                    </button>
                  )}
                  {recordingPreviewUrl && (
                    <>
                      <button
                        type="button"
                        onClick={useRecordedStory}
                        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        Salvar este story
                      </button>
                      <button
                        type="button"
                        onClick={restartRecorder}
                        className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
                      >
                        Gravar outro
                      </button>
                    </>
                  )}
                  <button type="button" onClick={closeRecorder} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                    Fechar
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





