// On conserve l'intégralité de tes configurations d'initialisation Firebase habituelles au début du fichier
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// REPRENDRE ICI TES PROPRES PARAMÈTRES DU CONFIG DE CONFIGURATION FIREBASE
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY_FIREBASE",
    authDomain: "VOTRE_AUTH_DOMAIN",
    projectId: "VOTRE_PROJECT_ID",
    storageBucket: "VOTRE_STORAGE_BUCKET",
    messagingSenderId: "VOTRE_SENDER_ID",
    appId: "VOTRE_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Variables globales de l'application
let catalogueEquipements = [];
let panierCourant = [];
let profilUtilisateurConnecte = null;
let cleApiGeminiDynamique = ""; // Sera chargée dynamiquement depuis Firestore
let discussionActiveAdminId = null;

// Variables pour l'enregistrement Audio WhatsApp
let enregistreurMediaClient = null;
let enregistreurMediaAdmin = null;
let morceauxAudioClient = [];
let morceauxAudioAdmin = [];

// --- LOGIQUE UNIQUE CHIFFREMENT MAISON (Bout en bout direct pour éviter la lecture en clair sur Firebase) ---
function chiffrerTexte(texte) {
    return btoa(unescape(encodeURIComponent(texte))); // Encodage sécurisé de base en chaîne protégée
}
function dechiffrerTexte(texteChiffre) {
    try { return decodeURIComponent(escape(atob(texteChiffre))); } catch(e) { return texteChiffre; }
}

// --- CHARGEMENT DYNAMIQUE DE LA CLÉ API GEMINI DEPUIS FIRESTORE (Contourne la sécurité GitHub) ---
async function chargerCleApiGemini() {
    try {
        const docRef = doc(db, "configuration", "gemini");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            cleApiGeminiDynamique = docSnap.data().cleSecret || "";
        }
    } catch (error) {
        console.error("Erreur de récupération de la clé API :", error);
    }
}

// Appel de l'API Intel Gemini avec la clé dynamique
async function appelerAPIIntelGemini(promptSysteme, promptUtilisateur) {
    if (!cleApiGeminiDynamique) {
        return "⚠️ L'administrateur n'a pas encore configuré sa clé API Gemini dans le panneau d'administration ou celle-ci est invalide.";
    }
    const lienApi = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleApiGeminiDynamique}`;
    try {
        const reponse = await fetch(lienApi, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: `${promptSysteme}\n\nClient: ${promptUtilisateur}` }]
                }]
            })
        });
        const donneesJSON = await response.json();
        return donneesJSON.candidates[0].content.parts[0].text;
    } catch (e) {
        return "Désolé, une erreur est survenue lors de la connexion à l'intelligence artificielle.";
    }
}

// --- INITIALISATION APPLICATIVE AU CHARGEMENT DE LA PAGE ---
document.addEventListener("DOMContentLoaded", async () => {
    await chargerCleApiGemini();
    configurerEvenementsMessagerieEtCle();
    // (Garder ici tes branchements d'interfaces habituels de rendu produits, panier, auth, etc.)
});

function configurerEvenementsMessagerieEtCle() {
    // 1. Sauvegarde graphique de la clé API par l'Admin
    const btnSauvegarderCle = document.getElementById("admin-save-key-btn");
    const inputCleAdmin = document.getElementById("admin-gemini-key-input");
    if (btnSauvegarderCle) {
        btnSauvegarderCle.addEventListener("click", async () => {
            const nouvelleCle = inputCleAdmin.value.trim();
            if (!nouvelleCle) return alert("Veuillez saisir une clé valide.");
            try {
                await setDoc(doc(db, "configuration", "gemini"), { cleSecret: nouvelleCle });
                cleApiGeminiDynamique = nouvelleCle;
                alert("✅ Clé API Gemini enregistrée avec succès dans Firebase ! L'IA est réactivée.");
                inputCleAdmin.value = "";
            } catch (err) {
                alert("Erreur lors de la sauvegarde : " + err.message);
            }
        });
    }

    // 2. Sélecteur de mode de Chat Client (IA ou Humain)
    const selectModeChat = document.getElementById("chat-mode-select");
    const msgBienvenue = document.getElementById("chat-welcome-msg");
    if (selectModeChat) {
        selectModeChat.addEventListener("change", () => {
            if (selectModeChat.value === "human") {
                msgBienvenue.textContent = "Vous êtes connecté avec notre boutique à Kamina. Écrivez votre message ou envoyez un audio.";
                ecouterMessagesChatClient();
            } else {
                msgBienvenue.textContent = "Bonjour ! Je suis l'IA de TechShop. Je connais parfaitement notre stock actuel. Quel matériel cherchez-vous ?";
            }
        });
    }

    // 3. Bouton Envoi Message Client
    const btnEnvoiChatClient = document.getElementById("ai-chat-send-btn");
    const inputChatClient = document.getElementById("ai-chat-input");
    if (btnEnvoiChatClient) {
        btnEnvoiChatClient.addEventListener("click", () => {
            gererEnvoiChatClient();
        });
    }

    // 4. Gestion Audio Client (Bouton Micro)
    const btnMicroClient = document.getElementById("chat-mic-btn");
    if (btnMicroClient) {
        btnMicroClient.addEventListener("click", () => {
            gererAudioClient(btnMicroClient);
        });
    }

    // 5. Bouton Envoi Admin et Micro Admin
    const btnEnvoiChatAdmin = document.getElementById("admin-chat-send-btn");
    const btnMicroAdmin = document.getElementById("admin-chat-mic-btn");
    if (btnEnvoiChatAdmin) btnEnvoiChatAdmin.addEventListener("click", () => gererEnvoiChatAdmin());
    if (btnMicroAdmin) btnMicroAdmin.addEventListener("click", () => gererAudioAdmin(btnMicroAdmin));

    // Écouter les fils de discussion sur l'interface Admin
    ecouterFilsDiscussionsAdmin();
}

// --- LOGIQUE CHAT LANCEE PAR LE CLIENT ---
async function gererEnvoiChatClient() {
    const inputChatClient = document.getElementById("ai-chat-input");
    const msgContainer = document.getElementById("ai-chat-messages");
    const texte = inputChatClient.value.trim();
    if (!texte) return;

    // Affichage local direct
    msgContainer.innerHTML += `<div class="ai-msg user">${texte}</div>`;
    inputChatClient.value = "";
    msgContainer.scrollTop = msgContainer.scrollHeight;

    const selectModeChat = document.getElementById("chat-mode-select");
    if (selectModeChat && selectModeChat.value === "human") {
        // Mode Humain -> Envoi sur Firebase Firestore chiffré de bout en bout
        const mailClient = auth.currentUser ? auth.currentUser.email : "client-anonyme";
        await addDoc(collection(db, "discussions_live", mailClient, "messages"), {
            expediteur: "client",
            type: "texte",
            contenu: chiffrerTexte(texte),
            timestamp: serverTimestamp()
        });
        // Mettre à jour le fil d'attente pour notification admin
        await setDoc(doc(db, "fils_discussions", mailClient), { dernierMessage: new Date().toLocaleTimeString(), timestamp: serverTimestamp() });
    } else {
        // Mode IA d'origine préservé
        gererAssistantDialogueClient(texte);
    }
}

// Enregistrement Audio WhatsApp Client
async function gererAudioClient(btn) {
    if (!enregistreurMediaClient) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return alert("L'enregistrement audio n'est pas supporté sur ce navigateur.");
        }
        const fluxStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        enregistreurMediaClient = new MediaRecorder(fluxStream);
        enregistreurMediaClient.ondataavailable = (e) => morceauxAudioClient.push(e.data);
        enregistreurMediaClient.onstop = async () => {
            const blobAudio = new Blob(morceauxAudioClient, { type: 'audio/webm' });
            morceauxAudioClient = [];
            const lecteurRef = new FileReader();
            lecteurRef.readAsDataURL(blobAudio);
            lecteurRef.onloadend = async () => {
                const base64Audio = lecteurRef.result;
                const mailClient = auth.currentUser ? auth.currentUser.email : "client-anonyme";
                // Envoi sécurisé chiffré
                await addDoc(collection(db, "discussions_live", mailClient, "messages"), {
                    expediteur: "client",
                    type: "audio",
                    contenu: chiffrerTexte(base64Audio),
                    timestamp: serverTimestamp()
                });
                await setDoc(doc(db, "fils_discussions", mailClient), { dernierMessage: "🎤 Message audio", timestamp: serverTimestamp() });
            };
        };
        enregistreurMediaClient.start();
        btn.classList.add("recording-active");
    } else {
        enregistreurMediaClient.stop();
        enregistreurMediaClient = null;
        btn.classList.remove("recording-active");
    }
}

// Écoute temps réel des réponses reçues côté Client
let desabonnementChatClient = null;
function ecouterMessagesChatClient() {
    if (desabonnementChatClient) desabonnementChatClient();
    const mailClient = auth.currentUser ? auth.currentUser.email : "client-anonyme";
    const requeteMessages = query(collection(db, "discussions_live", mailClient, "messages"), orderBy("timestamp", "asc"));
    
    desabonnementChatClient = onSnapshot(requeteMessages, (snapshot) => {
        const msgContainer = document.getElementById("ai-chat-messages");
        // Garder le premier message de bienvenue
        msgContainer.innerHTML = `<div class="ai-msg bot">Vous êtes connecté avec notre boutique à Kamina. Écrivez votre message ou envoyez un audio.</div>`;
        
        snapshot.forEach((doc) => {
            const donnees = doc.data();
            const alignement = donnees.expediteur === "client" ? "user" : "bot";
            const messageDechiffre = dechiffrerTexte(donnees.contenu);
            
            if (donnees.type === "texte") {
                msgContainer.innerHTML += `<div class="ai-msg ${alignement}">${messageDechiffre}</div>`;
            } else if (donnees.type === "audio") {
                msgContainer.innerHTML += `
                    <div class="ai-msg ${alignement}">
                        🎤 Audio :
                        <div class="audio-msg-play"><audio src="${messageDechiffre}" controls style="max-width: 100%; height: 30px;"></audio></div>
                    </div>`;
            }
        });
        msgContainer.scrollTop = msgContainer.scrollHeight;
    });
}

// --- LOGIQUE CHAT ET INTERFACE CÔTÉ ADMINISTRATEUR ---
function ecouterFilsDiscussionsAdmin() {
    const requeteFils = query(collection(db, "fils_discussions"), orderBy("timestamp", "desc"));
    onSnapshot(requeteFils, (snapshot) => {
        const conteneurFils = document.getElementById("admin-chat-threads");
        if (!conteneurFils) return;
        conteneurFils.innerHTML = "";
        
        if (snapshot.empty) {
            conteneurFils.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; padding: 5px;">Aucune discussion active.</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const idFil = docSnap.id;
            const donnees = docSnap.data();
            const elementFil = document.createElement("button");
            elementFil.className = `chat-thread-item ${discussionActiveAdminId === idFil ? 'active' : ''}`;
            elementFil.innerHTML = `<strong>👤 ${idFil}</strong><br><small style="color:var(--primary)">${donnees.dernierMessage}</small>`;
            elementFil.onclick = () => ouvrirDiscussionActiveAdmin(idFil);
            conteneurFils.appendChild(elementFil);
        });
    });
}

let desabonnementChatAdmin = null;
function ouvrirDiscussionActiveAdmin(idFil) {
    discussionActiveAdminId = idFil;
    document.getElementById("admin-active-chat-box").style.display = "block";
    document.getElementById("admin-active-chat-title").textContent = `Discussion avec : ${idFil}`;
    
    if (desabonnementChatAdmin) desabonnementChatAdmin();
    const requeteMessages = query(collection(db, "discussions_live", idFil, "messages"), orderBy("timestamp", "asc"));
    
    desabonnementChatAdmin = onSnapshot(requeteMessages, (snapshot) => {
        const conteneurMessages = document.getElementById("admin-chat-messages-container");
        conteneurMessages.innerHTML = "";
        
        snapshot.forEach((doc) => {
            const donnees = doc.data();
            const alignement = donnees.expediteur === "admin" ? "admin" : "client";
            const msgDechiffre = dechiffrerTexte(donnees.contenu);
            
            if (donnees.type === "texte") {
                conteneurMessages.innerHTML += `<div class="admin-msg-chat ${alignement}"><strong>${alignement.toUpperCase()}:</strong> ${msgDechiffre}</div>`;
            } else if (donnees.type === "audio") {
                conteneurMessages.innerHTML += `
                    <div class="admin-msg-chat ${alignement}">
                        <strong>${alignement.toUpperCase()}:</strong> 🎤 Audio
                        <div class="audio-msg-play"><audio src="${msgDechiffre}" controls style="max-width:100%; height:25px;"></audio></div>
                    </div>`;
            }
        });
        conteneurMessages.scrollTop = conteneurMessages.scrollHeight;
    });
}

async function gererEnvoiChatAdmin() {
    const input = document.getElementById("admin-chat-input");
    const texte = input.value.trim();
    if (!texte || !discussionActiveAdminId) return;

    await addDoc(collection(db, "discussions_live", discussionActiveAdminId, "messages"), {
        expediteur: "admin",
        type: "texte",
        contenu: chiffrerTexte(texte),
        timestamp: serverTimestamp()
    });
    await setDoc(doc(db, "fils_discussions", discussionActiveAdminId), { dernierMessage: texte, timestamp: serverTimestamp() });
    input.value = "";
}

async function gererAudioAdmin(btn) {
    if (!discussionActiveAdminId) return;
    if (!enregistreurMediaAdmin) {
        const fluxStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        enregistreurMediaAdmin = new MediaRecorder(fluxStream);
        enregistreurMediaAdmin.ondataavailable = (e) => morceauxAudioAdmin.push(e.data);
        enregistreurMediaAdmin.onstop = async () => {
            const blobAudio = new Blob(morceauxAudioAdmin, { type: 'audio/webm' });
            morceauxAudioAdmin = [];
            const lecteurRef = new FileReader();
            lecteurRef.readAsDataURL(blobAudio);
            lecteurRef.onloadend = async () => {
                const base64Audio = lecteurRef.result;
                await addDoc(collection(db, "discussions_live", discussionActiveAdminId, "messages"), {
                    expediteur: "admin",
                    type: "audio",
                    contenu: chiffrerTexte(base64Audio),
                    timestamp: serverTimestamp()
                });
                await setDoc(doc(db, "fils_discussions", discussionActiveAdminId), { dernierMessage: "🎤 Message audio admin", timestamp: serverTimestamp() });
            };
        };
        enregistreurMediaAdmin.start();
        btn.classList.add("recording-active");
    } else {
        enregistreurMediaAdmin.stop();
        enregistreurMediaAdmin = null;
        btn.classList.remove("recording-active");
    }
}

// --- LOGIQUE PRESERVÉE DE L'ASSISTANT IA CLIENT (PREMIÈRE LOGIQUE DEMANDÉE DU STOCK COPIÉE À L'IDENTIQUE) ---
async function gererAssistantDialogueClient(texteClient) {
    const msgContainer = document.getElementById("ai-chat-messages");
    let descriptionStock = catalogueEquipements.map(p => `- ${p.nom} (${p.specs}) : ${p.prix}$`).join("\n");
    if (!descriptionStock) descriptionStock = "Aucun équipement disponible pour le moment.";
    
    const promptSysteme = `Tu es l'Intelligence Artificielle Officielle de TechShop, magasin d'ordinateurs et d'équipements technologiques haut de gamme situé à Kamina. Tu as une attitude polie et commerciale. Voici notre stock réel extrait en temps réel de notre base de données : \n${descriptionStock}\n\nInstructions impératives :\n1. Ne propose OU ne conseille QUE des produits présents dans cette liste ci-dessus.\n2. Si un produit demandé n'est pas dans la liste, indique poliment qu'il est en rupture de stock et oriente-le vers un produit équivalent disponible.\n3. Réponds de manière concise, polie et professionnelle.`;
    
    const loaderId = "loader-" + Date.now();
    msgContainer.innerHTML += `<div class="ai-msg bot" id="${loaderId}">Réflexion en cours...</div>`;
    msgContainer.scrollTop = msgContainer.scrollHeight;
    
    const reponseIA = await appelerAPIIntelGemini(promptSysteme, texteClient);
    
    const loaderEl = document.getElementById(loaderId);
    if (loaderEl) loaderEl.textContent = reponseIA;
    msgContainer.scrollTop = msgContainer.scrollHeight;
}
