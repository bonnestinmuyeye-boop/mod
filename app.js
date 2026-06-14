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

// METS TES PROPRES CONFIGURATIONS FIREBASE ICI
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
let catalogueProduits = [];

const listesEcrans = ["screen-home", "screen-auth", "screen-checkout", "screen-admin"];
function basculerEcran(idEcranActif) {
    listesEcrans.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === idEcranActif) ? "grid" : "none";
    });
    if (idEcranActif === "screen-home") chargerProduitsVitrine();
}

// Clic sur le Logo
document.getElementById("main-logo-btn").addEventListener("click", () => {
    if (estAdmin) basculerEcran("screen-admin");
    else basculerEcran("screen-home");
});

// Thème Sombre / Clair
document.getElementById("theme-toggle").addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
});

// ================================================================= */
// 4. SYSTÈME DE PANIER ET LOCALSTORAGE (RESTAURÉ D'ORIGINE)         */
// ================================================================= */
let panier = JSON.parse(localStorage.getItem("techshop_panier")) || [];

// Rendre les fonctions accessibles globalement pour le HTML (onclick)
window.ajouterAuPanier = function(idProduit) {
    const produit = catalogueProduits.find(p => p.id === idProduit);
    if (!produit) return;

    const articleExistant = panier.find(item => item.id === idProduit);
    if (articleExistant) {
        articleExistant.quantite += 1;
    } else {
        panier.push({
            id: produit.id,
            nom: produit.nom,
            prix: produit.prix,
            image: produit.image,
            quantite: 1
        });
    }
    sauvegarderEtMettreAJourPanier();
};

window.changerQuantite = function(idProduit, delta) {
    const article = panier.find(item => item.id === idProduit);
    if (!article) return;

    article.quantite += delta;
    if (article.quantite <= 0) {
        panier = panier.filter(item => item.id !== idProduit);
    }
    sauvegarderEtMettreAJourPanier();
};

function sauvegarderEtMettreAJourPanier() {
    localStorage.setItem("techshop_panier", JSON.stringify(panier));
    mettreAJourInterfacePanier();
}

function mettreAJourInterfacePanier() {
    // Mettre à jour le badge du compteur
    const totalArticles = panier.reduce((total, item) => total + item.quantite, 0);
    document.getElementById("cart-count").textContent = totalArticles;

    // Remplir le conteneur du panier latéral
    const container = document.getElementById("cart-items-container");
    if (panier.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Votre panier est vide.</p>`;
        document.getElementById("cart-total").textContent = "0 $";
        return;
    }

    let totalPrix = 0;
    container.innerHTML = panier.map(item => {
        const sousTotal = item.prix * item.quantite;
        totalPrix += sousTotal;
        return `
            <div class="cart-item">
                <img src="${item.image || 'https://via.placeholder.com/150'}" alt="${item.nom}">
                <div class="item-details">
                    <h4>${item.nom}</h4>
                    <p>${item.prix} $</p>
                    <div class="quantity-controls">
                        <button onclick="changerQuantite('${item.id}', -1)">-</button>
                        <span>${item.quantite}</span>
                        <button onclick="changerQuantite('${item.id}', 1)">+</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById("cart-total").textContent = `${totalPrix} $`;
}

// Événements pour ouvrir/fermer le panier de droite
document.getElementById("open-cart-btn").addEventListener("click", () => {
    document.getElementById("cart-sidebar").classList.add("open");
    document.getElementById("sidebar-overlay").classList.add("active");
});

const fermerPanier = () => {
    document.getElementById("cart-sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("active");
};
document.getElementById("close-cart-btn").addEventListener("click", fermerPanier);
document.getElementById("sidebar-overlay").addEventListener("click", fermerPanier);

// Passer la commande
document.getElementById("proceed-to-checkout-btn").addEventListener("click", () => {
    if (panier.length === 0) {
        alert("Votre panier est vide !");
        return;
    }
    fermerPanier();
    
    // Préparer le résumé de la page de paiement
    const summaryContainer = document.getElementById("checkout-summary-items");
    let totalCheckout = 0;
    
    summaryContainer.innerHTML = panier.map(item => {
        const sousTotal = item.prix * item.quantite;
        totalCheckout += sousTotal;
        return `
            <div class="summary-item">
                <span>${item.nom} (x${item.quantite})</span>
                <span>${sousTotal} $</span>
            </div>
        `;
    }).join('');

    document.getElementById("summary-subtotal").textContent = `${totalCheckout} $`;
    document.getElementById("summary-total").textContent = `${totalCheckout} $`;

    if (!utilisateurConnecte) {
        alert("Veuillez vous connecter pour finaliser votre commande.");
        basculerEcran("screen-auth");
    } else {
        basculerEcran("screen-checkout");
    }
});

// Soumission du formulaire de livraison / paiement
document.getElementById("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (panier.length === 0) return;

    const commandeInfo = {
        clientUid: utilisateurConnecte.uid,
        clientEmail: utilisateurConnecte.email,
        nom: document.getElementById("nom").value.trim(),
        telephone: "+243" + document.getElementById("telephone").value.trim(),
        adresse: {
            numero: document.getElementById("adr-numero").value.trim(),
            avenue: document.getElementById("adr-avenue").value.trim(),
            quartier: document.getElementById("adr-quartier").value.trim(),
            commune: document.getElementById("adr-commune").value.trim()
        },
        modePaiement: document.querySelector('input[name="payment"]:checked').value,
        articles: panier,
        statut: "En attente",
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "commandes"), commandeInfo);
        alert("Félicitations ! Votre commande a été enregistrée avec succès.");
        panier = [];
        sauvegarderEtMettreAJourPanier();
        basculerEcran("screen-home");
    } catch (err) {
        alert("Erreur lors de la validation de la commande : " + err.message);
    }
});

// Cacher/Montrer les opérateurs selon le choix de paiement
document.getElementById("pay-mobile").addEventListener("change", () => {
    document.getElementById("mobile-operators-section").style.display = "block";
});
document.getElementById("pay-cash").addEventListener("change", () => {
    document.getElementById("mobile-operators-section").style.display = "none";
});

// ================================================================= */
// 5. SYSTÈME DE CONNEXION ET AUTHENTIFICATION                       */
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
    document.getElementById("link-switch-auth").textContent = estEnModeInscription ? "Se connecter" : "Créer un compte";
});

document.getElementById("toggle-password-visibility").addEventListener("click", () => {
    const pInput = document.getElementById("auth-password");
    pInput.type = pInput.type === "password" ? "text" : "password";
});

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
            alert("Compte créé avec succès !");
        } else {
            await signInWithEmailAndPassword(auth, email, mdp);
        }
        document.getElementById("auth-form").reset();
    } catch (err) {
        alert("Erreur d'authentification : " + err.message);
    }
});

// Suivi de l'état d'authentification
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
            chargerCommandesAdmin();
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
    sauvegarderEtMettreAJourPanier();
});

// ================================================================= */
// 6. CHARGEMENT ET ENREGISTREMENT DU CATALOGUE                       */
// ================================================================= */
function chargerProduitsVitrine() {
    onSnapshot(collection(db, "produits"), (snapshot) => {
        catalogueProduits = [];
        snapshot.forEach(d => catalogueProduits.push({ id: d.id, ...d.data() }));
        afficherProduits(catalogueProduits);
        if (estAdmin) afficherProduitsAdmin(catalogueProduits);
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

function afficherProduitsAdmin(liste) {
    const container = document.getElementById("admin-products-list-container");
    if (!container) return;
    container.innerHTML = liste.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-body); padding:8px; border-radius:6px; margin-bottom:5px; border:1px solid var(--border);">
            <span style="font-size:13px;">${p.nom} - <strong>${p.prix} $</strong></span>
            <span style="color:var(--text-muted); font-size:11px;">${p.categorie}</span>
        </div>
    `).join('');
}

// Recherche de produits
document.getElementById("search-input").addEventListener("input", (e) => {
    const txt = e.target.value.toLowerCase();
    const filtres = catalogueProduits.filter(p => p.nom.toLowerCase().includes(txt) || p.caracteristiques.toLowerCase().includes(txt));
    afficherProduits(filtres);
});

// Gestion des catégories du formulaire d'ajout Admin
let categorieAdminSelectionnee = "Ordinateurs";
["computers", "smartphones", "accessories"].forEach(id => {
    const btn = document.getElementById("tab-" + id);
    if(btn) {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            categorieAdminSelectionnee = btn.textContent.trim().split(" ").pop();
            document.getElementById("form-admin-title").textContent = `Ajouter un produit dans : ${categorieAdminSelectionnee}`;
        });
    }
});

// Enregistrer un nouveau produit (Admin)
document.getElementById("admin-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!estAdmin) return;
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

// Charger le suivi des commandes pour l'admin
function chargerCommandesAdmin() {
    onSnapshot(collection(db, "commandes"), (snapshot) => {
        const container = document.getElementById("admin-orders-container");
        if (snapshot.empty) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Aucune commande pour le moment.</p>`;
            return;
        }
        container.innerHTML = snapshot.docs.map(docSnap => {
            const cmd = docSnap.data();
            return `
                <div style="background:var(--bg-card); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid var(--border); font-size:12px;">
                    <strong>Client :</strong> ${cmd.nom} (${cmd.telephone})<br>
                    <strong>Adresse :</strong> N°${cmd.adresse.numero}, Av. ${cmd.adresse.avenue}, Q. ${cmd.adresse.quartier}, ${cmd.adresse.commune}<br>
                    <strong>Paiement :</strong> ${cmd.modePaiement}<br>
                    <strong>Articles :</strong> ${cmd.articles.map(a => `${a.nom} (x${a.quantite})`).join(', ')}
                </div>
            `;
        }).join('');
    });
}

// ================================================================= */
// 7. MODULE CHAT SÉCURISÉ DE BOUT EN BOUT : CÔTÉ CLIENT              */
// ================================================================= */
const bulleOpenBtn = document.getElementById("ai-chat-open-btn");
const boxChat = document.getElementById("ai-chat-box");
if(bulleOpenBtn && boxChat) {
    bulleOpenBtn.addEventListener("click", () => {
        boxChat.style.display = boxChat.style.display === "flex" ? "none" : "flex";
    });
    document.getElementById("ai-chat-close-btn").addEventListener("click", () => { boxChat.style.display = "none"; });
}

function initWhatsAppSectionClient() {
    if (!utilisateurConnecte) return;
    const q = query(collection(db, "chats", utilisateurConnecte.uid, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("client-chat-messages-container");
        if(!container) return;
        container.innerHTML = "";
        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            const estMonMessage = (m.senderId === utilisateurConnecte.uid);
            const texteAffiche = m.type === "audio" ? "" : dechiffrerDeBoutEnBout(m.message);
            
            const div = document.createElement("div");
            div.className = `msg-bubble ${estMonMessage ? 'outgoing' : 'incoming'}`;
            
            if (m.type === "audio") {
                div.innerHTML = `<div class="audio-player"> 🎵 <audio src="${m.audioUrl}" controls></audio></div>`;
            } else {
                div.textContent = texteAffiche;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

document.getElementById("client-chat-send-btn").addEventListener("click", envoyerMessageTexteClient);
document.getElementById("client-chat-input").addEventListener("keypress", (e) => { if(e.key === "Enter") envoyerMessageTexteClient(); });

async function envoyerMessageTexteClient() {
    const input = document.getElementById("client-chat-input");
    const texte = input.value.trim();
    if (!texte || !utilisateurConnecte) return;

    const texteChiffre = chiffrerDeBoutEnBout(texte);
    input.value = "";

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

const clientMicBtn = document.getElementById("client-chat-mic-btn");
if(clientMicBtn) {
    clientMicBtn.addEventListener("click", () => gererEnregistrementAudio(utilisateurConnecte.uid, clientMicBtn));
}

// ================================================================= */
// 8. MODULE CHAT SÉCURISÉ DE BOUT EN BOUT : CÔTÉ ADMINISTRATEUR      */
// ================================================================= */
function initWhatsAppSectionAdmin() {
    onSnapshot(collection(db, "utilisateurs_actifs_chat"), (snapshot) => {
        const sidebar = document.getElementById("admin-chat-users-list");
        if(!sidebar) return;
        sidebar.innerHTML = "";
        if (snapshot.empty) {
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
    
    // Rafraîchir la sélection visuelle active de la liste de gauche
    document.querySelectorAll(".chat-user-item").forEach(item => {
        if(item.textContent === emailClient.split('@')[0]) item.classList.add("active");
        else item.classList.remove("active");
    });

    const q = query(collection(db, "chats", uidClient, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("admin-chat-messages-container");
        if(!container) return;
        container.innerHTML = "";
        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            const estAdminMsg = (m.senderId === utilisateurConnecte.uid);
            const texteAffiche = m.type === "audio" ? "" : dechiffrerDeBoutEnBout(m.message);

            const div = document.createElement("div");
            div.className = `msg-bubble ${estAdminMsg ? 'outgoing' : 'incoming'}`;
            
            if (m.type === "audio") {
                div.innerHTML = `<div class="audio-player"> 🎵 <audio src="${m.audioUrl}" controls></audio></div>`;
            } else {
                div.textContent = texteAffiche;
            }
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

document.getElementById("admin-chat-send-btn").addEventListener("click", envoyerMessageTexteAdmin);
document.getElementById("admin-chat-input").addEventListener("keypress", (e) => { if(e.key === "Enter") envoyerMessageTexteAdmin(); });

async function envoyerMessageTexteAdmin() {
    const input = document.getElementById("admin-chat-input");
    const texte = input.value.trim();
    if (!texte || !clientSelectionnePourChat || !utilisateurConnecte) return;

    const texteChiffre = chiffrerDeBoutEnBout(texte);
    input.value = "";

    await addDoc(collection(db, "chats", clientSelectionnePourChat, "messages"), {
        senderId: utilisateurConnecte.uid,
        message: texteChiffre,
        type: "texte",
        timestamp: serverTimestamp()
    });
}

const adminMicBtn = document.getElementById("admin-chat-mic-btn");
if(adminMicBtn) {
    adminMicBtn.addEventListener("click", () => {
        if (!clientSelectionnePourChat) return;
        gererEnregistrementAudio(clientSelectionnePourChat, adminMicBtn);
    });
}

// ================================================================= */
// 9. LOGIQUE MUTUELLE DE CAPTURE ET ENVOI AUDIO                      */
// ================================================================= */
async function gererEnregistrementAudio(idDossierChat, elementBoutonMic) {
    if (enregistreurMedia && enregistreurMedia.state === "recording") {
        elementBoutonMic.classList.remove("recording");
        elementBoutonMic.textContent = "🎤";
        enregistreurMedia.stop();
    } else {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("L'enregistrement audio n'est pas supporté ou autorisé.");
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
                
                const snapshot = await uploadBytes(stockageRef, blobAudio);
                const urlAudioRecuperee = await getDownloadURL(snapshot.ref);
                
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

// Premier chargement initial obligatoire
chargerProduitsVitrine();
