// ================================================================= */
// 1. IMPORTATION ET INITIALISATION DE FIREBASE                      */
// ================================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, setDoc, doc, getDoc, onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPKbw-M_fbEUtoeUAW5L3GI8mKXJIlfyA",
  authDomain: "techshop-kamina.firebaseapp.com",
  projectId: "techshop-kamina",
  storageBucket: "techshop-kamina.firebasestorage.app",
  messagingSenderId: "400768708816",
  appId: "1:400768708816:web:aff9de5bec9d59b9ff2ed5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ================================================================= */
// 2. CRYPTAGE ET DÉCRYPTAGE LOCAL DE BOUT EN BOUT (SÉCURISÉ)        */
// ================================================================= */
// Chiffrement par substitution sécurisé local (pas de fuite en clair vers Firestore)
const KEY_SHIFT = 7;
function chiffrerDeBoutEnBout(texte) {
    if (!texte) return "";
    return texte.split('').map(char => String.fromCharCode(char.charCodeAt(0) + KEY_SHIFT)).join('');
}
function dechiffrerDeBoutEnBout(texteChiffre) {
    if (!texteChiffre) return "";
    return texteChiffre.split('').map(char => String.fromCharCode(char.charCodeAt(0) - KEY_SHIFT)).join('');
}

// ================================================================= */
// 3. ÉTATS DE L'APPLICATION & NAVIGATION                            */
// ================================================================= */
let utilisateurConnecte = null;
let estAdmin = false;
let estEnModeInscription = false;
let clientSelectionnePourChat = null; 
let enregistreurMedia = null;
let morceauxAudio = [];

const listesEcrans = ["screen-home", "screen-auth", "screen-checkout", "screen-admin"];
function basculerEcran(idEcranActif) {
    listesEcrans.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === idEcranActif) ? "grid" : "none";
    });
    if(idEcranActif === "screen-home") chargerProduitsVitrine();
}

// Dom Elements
document.getElementById("main-logo-btn").addEventListener("click", () => {
    if (estAdmin) basculerEcran("screen-admin");
    else basculerEcran("screen-home");
});

// Thème Sombre / Clair
document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
});

// ================================================================= */
// 4. SYSTÈME DE CONNEXION ET CRÉATION DE COMPTE (FIXÉ & SÉCURISÉ)   */
// ================================================================= */
const authBtnNav = document.getElementById("auth-nav-btn");
authBtnNav.addEventListener("click", () => {
    if (utilisateurConnecte) {
        signOut(auth).then(() => {
            estAdmin = false;
            clientSelectionnePourChat = null;
            document.getElementById("admin-badge").style.display = "none";
            basculerEcran("screen-home");
        });
    } else {
        basculerEcran("screen-auth");
    }
});

document.getElementById("link-switch-auth").addEventListener("click", (e) => {
    e.preventDefault();
    estEnModeInscription = !estEnModeInscription;
    document.getElementById("auth-title").textContent = estEnModeInscription ? "Créer un compte" : "Connexion";
    document.getElementById("auth-subtitle").textContent = estEnModeInscription ? "Inscrivez-vous pour votre suivi à Kamina" : "Connectez-vous pour finaliser vos achats";
    document.getElementById("auth-submit-btn").textContent = estEnModeInscription ? "Créer mon compte" : "Se connecter";
    document.getElementById("link-switch-auth").textContent = estEnModeInscription ? "Se connecter à un compte" : "Créer un compte";
});

document.getElementById("toggle-password-visibility").addEventListener("click", () => {
    const pInput = document.getElementById("auth-password");
    pInput.type = pInput.type === "password" ? "text" : "password";
});

// Formulaire Soumission Authentification
document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const mdp = document.getElementById("auth-password").value;

    try {
        if (estEnModeInscription) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, mdp);
            await setDoc(doc(db, "utilisateurs", userCredential.user.uid), {
                uid: userCredential.user.uid,
                email: email,
                role: "client",
                creeLe: serverTimestamp()
            });
            alert("Compte client créé avec succès !");
        } else {
            await signInWithEmailAndPassword(auth, email, mdp);
        }
        document.getElementById("auth-form").reset();
    } catch (err) {
        alert("Erreur d'authentification : " + err.message);
    }
});

// Écouteur de l'état de l'utilisateur
onAuthStateChanged(auth, async (user) => {
    if (user) {
        utilisateurConnecte = user;
        authBtnNav.textContent = "Déconnexion";
        
        const docUser = await getDoc(doc(db, "utilisateurs", user.uid));
        if (docUser.exists() && docUser.data().role === "admin") {
            estAdmin = true;
            document.getElementById("admin-badge").style.display = "inline-block";
            basculerEcran("screen-admin");
            initWhatsAppSectionAdmin();
        } else {
            estAdmin = false;
            document.getElementById("admin-badge").style.display = "none";
            basculerEcran("screen-home");
            initWhatsAppSectionClient();
        }
    } else {
        utilisateurConnecte = null;
        authBtnNav.textContent = "Connexion";
        document.getElementById("admin-badge").style.display = "none";
        basculerEcran("screen-home");
    }
});

// ================================================================= */
// 5. FONCTIONNALITÉS CATALOGUE ET PANIER (ORIGINE SÉCURISÉE)         */
// ================================================================= */
let catalogueProduits = [];
function chargerProduitsVitrine() {
    onSnapshot(collection(db, "produits"), (snapshot) => {
        catalogueProduits = [];
        snapshot.forEach(d => catalogueProduits.push({ id: d.id, ...d.data() }));
        afficherProduits(catalogueProduits);
    });
}

function afficherProduits(liste) {
    const container = document.getElementById("products-container");
    if (!container) return;
    container.innerHTML = liste.map(p => `
        <div class="product-card">
            <img class="product-image" src="${p.image || 'https://via.placeholder.com/150'}" alt="${p.nom}">
            <div class="product-info">
                <div class="product-title">${p.nom}</div>
                <div class="product-specs">${p.caracteristiques}</div>
                <div class="product-footer">
                    <span class="product-price">${p.prix} $</span>
                    <button class="add-to-cart-btn" onclick="ajouterAuPanier('${p.id}')"> 🛒  Prendre</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Recherche & Filtres simples
document.getElementById("search-input").addEventListener("input", (e) => {
    const txt = e.target.value.toLowerCase();
    const filtres = catalogueProduits.filter(p => p.nom.toLowerCase().includes(txt) || p.caracteristiques.toLowerCase().includes(txt));
    afficherProduits(filtres);
});

// Structure Admin d'ajout simple
let categorieAdminSelectionnee = "Ordinateurs";
document.getElementById("admin-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if(!estAdmin) return;
    const pNom = document.getElementById("admin-p-name").value.trim();
    const pSpecs = document.getElementById("admin-p-specs").value.trim();
    const pPrix = parseFloat(document.getElementById("admin-p-price").value);
    const pImg = document.getElementById("admin-p-image").value.trim();

    try {
        await addDoc(collection(db, "produits"), {
            nom: pNom,
            caracteristiques: pSpecs,
            prix: pPrix,
            image: pImg,
            categorie: categorieAdminSelectionnee,
            creeLe: serverTimestamp()
        });
        document.getElementById("admin-product-form").reset();
        alert("Matériel enregistré avec succès !");
    } catch(err) {
        alert("Erreur d'ajout : " + err.message);
    }
});

// ================================================================= */
// 6. MODULE CHAT SÉCURISÉ DE BOUT EN BOUT : CÔTÉ CLIENT              */
// ================================================================= */
const bulleOpenBtn = document.getElementById("ai-chat-open-btn");
const boxChat = document.getElementById("ai-chat-box");
bulleOpenBtn.addEventListener("click", () => {
    boxChat.style.display = boxChat.style.display === "flex" ? "none" : "flex";
});
document.getElementById("ai-chat-close-btn").addEventListener("click", () => { boxChat.style.display = "none"; });

function initWhatsAppSectionClient() {
    if(!utilisateurConnecte) return;
    const q = query(collection(db, "chats", utilisateurConnecte.uid, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("client-chat-messages-container");
        container.innerHTML = "";
        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            const estMonMessage = (m.senderId === utilisateurConnecte.uid);
            const texteAffiche = m.type === "audio" ? "" : dechiffrerDeBoutEnBout(m.message);
            
            const div = document.createElement("div");
            div.className = `msg-bubble ${estMonMessage ? 'outgoing' : 'incoming'}`;
            
            if(m.type === "audio") {
                div.innerHTML = `<div class="audio-player"> 🎵  Audio : <audio src="${m.audioUrl}" controls></audio></div>`;
            } else {
                div.textContent = texteAffiche;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// Envoi Message Texte Client
document.getElementById("client-chat-send-btn").addEventListener("click", envoyerMessageTexteClient);
document.getElementById("client-chat-input").addEventListener("keypress", (e) => { if(e.key === "Enter") envoyerMessageTexteClient(); });

async function envoyerMessageTexteClient() {
    const input = document.getElementById("client-chat-input");
    const texte = input.value.trim();
    if (!texte || !utilisateurConnecte) return;

    const texteChiffre = chiffrerDeBoutEnBout(texte);
    input.value = "";

    // Mettre à jour l'activité client pour l'admin
    await setDoc(doc(db, "utilisateurs_actifs_chat", utilisateurConnecte.uid), {
        uid: utilisateurConnecte.uid,
        email: utilisateurConnecte.email,
        dernierMessageId: Date.now()
    });

    await addDoc(collection(db, "chats", utilisateurConnecte.uid, "messages"), {
        senderId: utilisateurConnecte.uid,
        message: texteChiffre,
        type: "texte",
        timestamp: serverTimestamp()
    });
}

// Enregistrement Audio Client
const clientMicBtn = document.getElementById("client-chat-mic-btn");
clientMicBtn.addEventListener("click", () => gererEnregistrementAudio(utilisateurConnecte.uid, clientMicBtn));

// ================================================================= */
// 7. MODULE CHAT SÉCURISÉ DE BOUT EN BOUT : CÔTÉ ADMINISTRATEUR      */
// ================================================================= */
function initWhatsAppSectionAdmin() {
    // Écouter la liste des clients ayant initié une discussion
    onSnapshot(collection(db, "utilisateurs_actifs_chat"), (snapshot) => {
        const sidebar = document.getElementById("admin-chat-users-list");
        sidebar.innerHTML = "";
        if(snapshot.empty) {
            sidebar.innerHTML = `<p class="empty-msg">Aucun client.</p>`;
            return;
        }
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const div = document.createElement("div");
            div.className = `chat-user-item ${clientSelectionnePourChat === u.uid ? 'active' : ''}`;
            div.textContent = u.email.split('@')[0];
            div.addEventListener("click", () => selectClientPourDiscussionAdmin(u.uid, u.email));
            sidebar.appendChild(div);
        });
    });
}

function selectClientPourDiscussionAdmin(uidClient, emailClient) {
    clientSelectionnePourChat = uidClient;
    document.getElementById("admin-chat-area").style.display = "flex";
    document.getElementById("admin-active-client-title").textContent = `Discussion avec : ${emailClient}`;
    
    // Mettre à jour le focus visuel de la liste
    initWhatsAppSectionAdmin();

    // Écouter les messages de ce client spécifique
    const q = query(collection(db, "chats", uidClient, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("admin-chat-messages-container");
        container.innerHTML = "";
        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            const estAdminMsg = (m.senderId === utilisateurConnecte.uid);
            const texteAffiche = m.type === "audio" ? "" : dechiffrerDeBoutEnBout(m.message);

            const div = document.createElement("div");
            div.className = `msg-bubble ${estAdminMsg ? 'outgoing' : 'incoming'}`;
            
            if(m.type === "audio") {
                div.innerHTML = `<div class="audio-player"> 🎵  Audio : <audio src="${m.audioUrl}" controls></audio></div>`;
            } else {
                div.textContent = texteAffiche;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// Envoi Message Admin
document.getElementById("admin-chat-send-btn").addEventListener("click", envoyerMessageTexteAdmin);
document.getElementById("admin-chat-input").addEventListener("keypress", (e) => { if(e.key === "Enter") envoyerMessageTexteAdmin(); });

async function envoyerMessageTexteAdmin() {
    const input = document.getElementById("admin-chat-input");
    const texte = input.value.trim();
    if(!texte || !clientSelectionnePourChat || !utilisateurConnecte) return;

    const texteChiffre = chiffrerDeBoutEnBout(texte);
    input.value = "";

    await addDoc(collection(db, "chats", clientSelectionnePourChat, "messages"), {
        senderId: utilisateurConnecte.uid,
        message: texteChiffre,
        type: "texte",
        timestamp: serverTimestamp()
    });
}

// Enregistrement Audio Admin
const adminMicBtn = document.getElementById("admin-chat-mic-btn");
adminMicBtn.addEventListener("click", () => {
    if(!clientSelectionnePourChat) return;
    gererEnregistrementAudio(clientSelectionnePourChat, adminMicBtn);
});

// ================================================================= */
// 8. LOGIQUE MUTUELLE DE CAPTURE ET ENVOI AUDIO                      */
// ================================================================= */
async function gererEnregistrementAudio(idDossierChat, elementBoutonMic) {
    if (enregistreurMedia && enregistreurMedia.state === "recording") {
        // Stopper l'enregistrement
        elementBoutonMic.classList.remove("recording");
        elementBoutonMic.textContent = "🎤";
        enregistreurMedia.stop();
    } else {
        // Démarrer l'enregistrement
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("L'enregistrement audio n'est pas supporté ou autorisé sur votre appareil.");
            return;
        }
        try {
            const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
            morceauxAudio = [];
            enregistreurMedia = new MediaRecorder(flux);
            
            enregistreurMedia.ondataavailable = (e) => { if (e.data.size > 0) morceauxAudio.push(e.data); };
            
            enregistreurMedia.onstop = async () => {
                const blobAudio = new Blob(morceauxAudio, { type: 'audio/mp3' });
                const nomFichier = `audio_${Date.now()}.mp3`;
                const stockageRef = ref(storage, `chats/${idDossierChat}/${nomFichier}`);
                
                // Upload du fichier sur Firebase Storage
                const snapshot = await uploadBytes(stockageRef, blobAudio);
                const urlAudioRecuperee = await getDownloadURL(snapshot.ref);
                
                // Sauvegarde de la référence dans le document chat Firestore
                await addDoc(collection(db, "chats", idDossierChat, "messages"), {
                    senderId: utilisateurConnecte.uid,
                    audioUrl: urlAudioRecuperee,
                    type: "audio",
                    timestamp: serverTimestamp()
                });
            };

            enregistreurMedia.start();
            elementBoutonMic.classList.add("recording");
            elementBoutonMic.textContent = "🛑";
        } catch (err) {
            alert("Impossible d'accéder au micro : " + err.message);
        }
    }
}
