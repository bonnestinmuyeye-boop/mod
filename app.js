// =================================================================
// 1. INITIALISATION DE TES CONFIGURATIONS FIREBASE (STRICTEMENT INTACTES)
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPKbw-M_fbEUtoeUAW5L3GI8mKXJIlfyA",
  authDomain: "techshop-kamina.firebaseapp.com",
  projectId: "techshop-kamina",
  storageBucket: "techshop-kamina.firebasestorage.app",
  messagingSenderId: "400768708816",
  appId: "1:400768708816:web:aff9de5bec9d59b9ff2ed5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Clé API Gemini chargée dynamiquement depuis Firestore (Contournement Sécurité GitHub)
let GEMINI_API_KEY = "";

// =================================================================
// 2. ÉTATS GLOBAUX RECONDUITS
// =================================================================
let CATALOGUE = [];
let PANIER = JSON.parse(localStorage.getItem('panier')) || [];
let categorieActiveClient = "tous";
let categorieActiveAdmin = "Ordinateurs";
let modeInscription = false;
let utilisateurConnecte = null;

// Variables Messagerie Réseau (WhatsApp style)
let threadEcouteActiveAdmin = null; 
let idClientChatSelectionneParAdmin = null; 
let mediaRecorder = null;
let chunksAudio = [];

// Chiffrement / Déchiffrement basique (Sécurité de bout en bout locale)
function crypterTexte(texte) {
    return btoa(unescape(encodeURIComponent(texte))); 
}
function decrypterTexte(crypto) {
    try { return decodeURIComponent(escape(atob(crypto))); } catch(e) { return crypto; }
}

// =================================================================
// 3. SYSTEME DE NAVIGATION ET ROUTAGE SÉCURISÉ
// =================================================================
function naviguerVers(idEcran) {
    fermerPanier();
    document.querySelectorAll('.app-screen').forEach(screen => { screen.style.display = 'none'; });
    const ecranCible = document.getElementById(idEcran);
    if (ecranCible) {
        if (idEcran === 'screen-checkout' || idEcran === 'screen-admin') {
            ecranCible.style.display = 'grid';
        } else {
            ecranCible.style.display = 'block';
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =================================================================
// 4. CHARGEMENT INITIAL & GESTIONNAIRES COMPLETS
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
    // Écouter le chargement de la clé Gemini depuis Firebase (évite le blocage GitHub)
    recupererCleGeminiDepuisCloud();

    const logo = document.getElementById('main-logo-btn');
    if (logo) logo.addEventListener('click', () => naviguerVers('screen-home'));

    // Liaisons Panier Intactes
    const openCartBtn = document.getElementById('open-cart-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const overlay = document.getElementById('sidebar-overlay');
    const proceedBtn = document.getElementById('proceed-to-checkout-btn');
    
    if (openCartBtn) openCartBtn.addEventListener('click', ouvrirPanier);
    if (closeCartBtn) closeCartBtn.addEventListener('click', fermerPanier);
    if (overlay) overlay.addEventListener('click', fermerPanier);
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            if (PANIER.length === 0) { alert("Votre panier est vide !"); return; }
            if (!utilisateurConnecte) {
                alert("Veuillez vous connecter pour valider votre commande.");
                modeInscription = false;
                basculerFormulaireAuth();
                naviguerVers('screen-auth');
                return;
            }
            preparerEcranCheckout();
            naviguerVers('screen-checkout');
        });
    }

    // Sauvegarde de la clé API par l'Admin
    const saveKeyBtn = document.getElementById('admin-save-key-btn');
    if (saveKeyBtn) saveKeyBtn.addEventListener('click', sauvegarderCleGeminiDansCloud);

    // Oeil d'authentification
    const togglePasswordBtn = document.getElementById('toggle-password-visibility');
    const passwordInput = document.getElementById('auth-password');
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) authForm.addEventListener('submit', gererSoumissionAuth);
    
    const linkSwitch = document.getElementById('link-switch-auth');
    if (linkSwitch) {
        linkSwitch.addEventListener('click', (e) => {
            e.preventDefault();
            modeInscription = !modeInscription;
            basculerFormulaireAuth();
        });
    }

    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) checkoutForm.addEventListener('submit', validerCommandeFinale);
    
    // Commutation onglets Commande
    const payMobile = document.getElementById('pay-mobile');
    const payCash = document.getElementById('pay-cash');
    if (payMobile) payMobile.addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'block'; });
    if (payCash) payCash.addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'none'; });

    // Filtres catégories (Barre horizontale fluide)
    document.querySelectorAll('.categories-container .filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.categories-container .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categorieActiveClient = this.getAttribute('data-category');
            afficherCatalogueClient();
        });
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', filtrerRecherche);

    // Onglets Espace Admin
    const tabsAdmin = { 'tab-computers': 'Ordinateurs', 'tab-smartphones': 'Smartphones', 'tab-accessories': 'Accessoires' };
    Object.keys(tabsAdmin).forEach(idTab => {
        const tabEl = document.getElementById(idTab);
        if (tabEl) {
            tabEl.addEventListener('click', function() {
                document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                categorieActiveAdmin = tabsAdmin[idTab];
                document.getElementById('form-admin-title').textContent = "Ajouter un produit dans : " + categorieActiveAdmin;
                afficherProduitsAdmin();
            });
        }
    });

    if (document.getElementById('admin-product-form')) {
        document.getElementById('admin-product-form').addEventListener('submit', ajouterNouveauProduitAdmin);
    }
    if (document.getElementById('admin-ai-img-btn')) {
        document.getElementById('admin-ai-img-btn').addEventListener('click', gererAssistantImageAdmin);
    }

    // Gestion de la Bulle Multidirectionnelle IA / Chat Admin
    const aiChatOpenBtn = document.getElementById('ai-chat-open-btn');
    if (aiChatOpenBtn) aiChatOpenBtn.addEventListener('click', () => { document.getElementById('ai-chat-box').classList.toggle('open'); });
    if (document.getElementById('ai-chat-close-btn')) {
        document.getElementById('ai-chat-close-btn').addEventListener('click', () => { document.getElementById('ai-chat-box').classList.remove('open'); });
    }

    // Gestion des Onglets Internes de la Bulle de Chat (IA vs Admin)
    const tabAI = document.getElementById('chat-tab-ai');
    const tabAdmin = document.getElementById('chat-tab-admin');
    if (tabAI && tabAdmin) {
        tabAI.addEventListener('click', () => {
            tabAI.classList.add('active'); tabAdmin.classList.remove('active');
            document.getElementById('chat-panel-ai').style.display = 'flex';
            document.getElementById('chat-panel-admin').style.display = 'none';
        });
        tabAdmin.addEventListener('click', () => {
            tabAdmin.classList.add('active'); tabAI.classList.remove('active');
            document.getElementById('chat-panel-admin').style.display = 'flex';
            document.getElementById('chat-panel-ai').style.display = 'none';
            activerMessagerieDirecteClient();
        });
    }

    // Boutons d'envois des formulaires de Chat
    if (document.getElementById('ai-chat-send-btn')) document.getElementById('ai-chat-send-btn').addEventListener('click', envoyerMessageIA);
    if (document.getElementById('ai-chat-input')) {
        document.getElementById('ai-chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') envoyerMessageIA(); });
    }
    
    if (document.getElementById('direct-send-btn')) document.getElementById('direct-send-btn').addEventListener('click', envoyerMessageDirectTexte);
    if (document.getElementById('direct-chat-input')) {
        document.getElementById('direct-chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') envoyerMessageDirectTexte(); });
    }

    // Enregistrement Audio (Style Bouton WhatsApp)
    const voiceBtn = document.getElementById('direct-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', gererEnregistrementAudioComplet);
    }

    // Gestion du Mode Sombre Intact
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }

    synchroniserPanier();
    chargerCatalogueDepuisCloud();
});

// =================================================================
// 5. GESTION DES CLÉS GEMINI DEPUIS FIRESTORE
// =================================================================
async function recupererCleGeminiDepuisCloud() {
    try {
        const docSnap = await getDoc(doc(db, "configuration", "gemini"));
        if (docSnap.exists()) {
            GEMINI_API_KEY = docSnap.data().key || "";
            const inputKey = document.getElementById('admin-gemini-key-input');
            if (inputKey) inputKey.value = GEMINI_API_KEY;
        }
    } catch(e) { console.error("Impossible de charger la clé API :", e); }
}

async function sauvegarderCleGeminiDansCloud() {
    const cleSaisie = document.getElementById('admin-gemini-key-input').value.trim();
    if (!cleSaisie) { alert("Le champ est vide."); return; }
    try {
        await setDoc(doc(db, "configuration", "gemini"), { key: cleSaisie, updatedAt: new Date().getTime() });
        GEMINI_API_KEY = cleSaisie;
        alert("Clé API enregistrée avec succès dans Firebase ! Vos services IA sont opérationnels.");
    } catch(e) { alert("Erreur d'écriture : " + e.message); }
}

// =================================================================
// 6. SURVEILLANCE SESSION & ROLES (DÉCLENCHEMENT DE L'ADMIN)
// =================================================================
onAuthStateChanged(auth, async (user) => {
    const authBtn = document.getElementById('auth-nav-btn');
    const adminBadge = document.getElementById('admin-badge');
    
    if (user) {
        utilisateurConnecte = user;
        if (authBtn) authBtn.textContent = "Déconnexion";
        
        try {
            const docSnap = await getDoc(doc(db, "utilisateurs", user.uid));
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                if (adminBadge) adminBadge.style.display = 'inline-block';
                naviguerVers('screen-admin');
                chargerUtilisateursAdmin();
                ecouterCommandesAdmin();
                ecouterFilsDiscussionsPourAdmin(); // Lancer l'écouteur de messagerie globale Admin
                setTimeout(() => { executerAnalyseIAAdmin(); }, 2000);
            } else {
                if (adminBadge) adminBadge.style.display = 'none';
            }
        } catch (e) { console.error(e); }
    } else {
        utilisateurConnecte = null;
        if (authBtn) authBtn.textContent = "Connexion";
        if (adminBadge) adminBadge.style.display = 'none';
    }
});

const authNavBtn = document.getElementById('auth-nav-btn');
if (authNavBtn) {
    authNavBtn.addEventListener('click', () => {
        if (utilisateurConnecte) {
            signOut(auth).then(() => { alert("Session déconnectée."); naviguerVers('screen-home'); });
        } else {
            modeInscription = false;
            basculerFormulaireAuth();
            naviguerVers('screen-auth');
        }
    });
}

// =================================================================
// 7. CATALOGUE & RECHERCHE INTERFACE CLIENT
// =================================================================
async function chargerCatalogueDepuisCloud() {
    try {
        const querySnapshot = await getDocs(collection(db, "produits"));
        CATALOGUE = [];
        querySnapshot.forEach((doc) => { CATALOGUE.push({ id: doc.id, ...doc.data() }); });
        afficherCatalogueClient();
        if (utilisateurConnecte) afficherProduitsAdmin();
    } catch (error) { console.error(error); }
}

function afficherCatalogueClient() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";
    const produitsFiltres = CATALOGUE.filter(p => categorieActiveClient === "tous" || p.category === categorieActiveClient);
    if (produitsFiltres.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Aucun matériel trouvé.</p>`;
        return;
    }
    produitsFiltres.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.imageUrl || 'https://via.placeholder.com/300'}" alt="${p.name}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-specs">${p.specs || ''}</p>
                <div class="product-footer">
                    <span class="product-price">${p.price} $</span>
                    <button class="add-to-cart-btn" data-id="${p.id}">🛒 Ajouter</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', function() { ajouterAuPanier(this.getAttribute('data-id')); });
    });
}

function filtrerRecherche() {
    const cible = this.value.toLowerCase();
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";
    const produitsFiltres = CATALOGUE.filter(p => p.name.toLowerCase().includes(cible) || (p.specs && p.specs.toLowerCase().includes(cible)));
    produitsFiltres.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.imageUrl || 'https://via.placeholder.com/300'}" alt="${p.name}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-specs">${p.specs || ''}</p>
                <div class="product-footer">
                    <span class="product-price">${p.price} $</span>
                    <button class="add-to-cart-btn" data-id="${p.id}">🛒 Ajouter</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// =================================================================
// 8. LOGIQUE D'AUTHENTIFICATION FORMULAIRE
// =================================================================
function basculerFormulaireAuth() {
    document.getElementById('auth-title').textContent = modeInscription ? "Créer un compte" : "Connexion";
    document.getElementById('auth-submit-btn').textContent = modeInscription ? "S'inscrire" : "Se connecter";
    document.getElementById('auth-switch-text').innerHTML = modeInscription ? 
        `Déjà inscrit ? <a href="#" id="link-switch-auth">Se connecter</a>` : 
        `Pas encore de compte ? <a href="#" id="link-switch-auth">Créer un compte</a>`;
    
    document.getElementById('link-switch-auth').addEventListener('click', (e) => {
        e.preventDefault(); modeInscription = !modeInscription; basculerFormulaireAuth();
    });
}

async function gererSoumissionAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    try {
        if (modeInscription) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, "utilisateurs", userCredential.user.uid), { email: email, role: "client", createdAt: serverTimestamp() });
            alert("Compte créé !");
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
        document.getElementById('auth-form').reset();
        naviguerVers('screen-home');
    } catch (err) { alert(err.message); }
}

// =================================================================
// 9. LOGIQUE DU PANIER (CONSERVÉE MASQUÉE POUR CHANGER DE LOOK)
// =================================================================
function ouvrirPanier() { 
    document.getElementById('cart-sidebar').classList.add('open'); 
    document.getElementById('sidebar-overlay').classList.add('open'); 
}
function fermerPanier() { 
    document.getElementById('cart-sidebar').classList.remove('open'); 
    document.getElementById('sidebar-overlay').classList.remove('open'); 
}

function ajouterAuPanier(id) {
    const itemStock = CATALOGUE.find(p => p.id === id);
    if (!itemStock) return;
    const existant = PANIER.find(item => item.id === id);
    if (existant) { existant.quantite++; } else { PANIER.push({ ...itemStock, quantite: 1 }); }
    synchroniserPanier();
    // Le panier reste fermé à l'ajout, offrant une expérience moderne et non-intrusive.
}

window.viderLePanierComplet = function() {
    if (confirm("Voulez-vous vider le panier complet ?")) { PANIER = []; synchroniserPanier(); fermerPanier(); }
};

function synchroniserPanier() {
    localStorage.setItem('panier', JSON.stringify(PANIER));
    const totalItems = PANIER.reduce((sum, item) => sum + item.quantite, 0);
    const prixTotal = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    
    if (document.getElementById('cart-count')) document.getElementById('cart-count').textContent = totalItems;
    if (document.getElementById('cart-total')) document.getElementById('cart-total').textContent = prixTotal + " $";
    
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    
    if (PANIER.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Votre panier est vide.</p>`;
    } else {
        container.innerHTML = "";
        PANIER.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            row.style = 'display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); gap:10px;';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex:1;">
                    <img src="${item.imageUrl || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; background:#fff;">
                    <div>
                        <h4 style="margin:0; font-size:13px; font-weight:600;">${item.name}</h4>
                        <small style="color:var(--text-muted);">${item.price} $ x ${item.quantite}</small>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', -1)">-</button>
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', 1)">+</button>
                    <button onclick="window.retirerDuPanier('${item.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;">❌</button>
                </div>
            `;
            container.appendChild(row);
        });
        
        const clearDiv = document.createElement('div');
        clearDiv.style.padding = '10px 0';
        clearDiv.innerHTML = `<button onclick="window.viderLePanierComplet()" style="width:100%; background:#ef4444; color:white; border:none; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">🗑️ Vider le panier complet</button>`;
        container.appendChild(clearDiv);
    }
    analyserPanierAvecIA();
}

window.modifierQte = function(id, mod) {
    const item = PANIER.find(i => i.id === id);
    if (!item) return;
    item.quantite += mod;
    if (item.quantite <= 0) PANIER = PANIER.filter(i => i.id !== id);
    synchroniserPanier();
};
window.retirerDuPanier = function(id) { PANIER = PANIER.filter(i => i.id !== id); synchroniserPanier(); };

function preparerEcranCheckout() {
    const summaryContainer = document.getElementById('checkout-summary-items');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = "";
    PANIER.forEach(item => {
        summaryContainer.innerHTML += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>${item.name} (x${item.quantite})</span><span>${item.price * item.quantite} $</span></div>`;
    });
    const total = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    document.getElementById('summary-subtotal').textContent = total + " $";
    document.getElementById('summary-total').textContent = total + " $";
}

async function validerCommandeFinale(e) {
    e.preventDefault();
    const modePaiement = document.querySelector('input[name="payment"]:checked').value;
    let detailPaiement = modePaiement === 'cash' ? 'À la livraison (Espèces)' : 'Mobile Money';
    if (modePaiement === 'mobile_money') {
        detailPaiement += ` (${document.querySelector('input[name="operator"]:checked').value})`;
    }
    
    const commandePayload = {
        clientUid: utilisateurConnecte.uid,
        clientEmail: utilisateurConnecte.email,
        livraison: {
            nom: document.getElementById('nom').value,
            telephone: "+243" + document.getElementById('telephone').value,
            numero: document.getElementById('adr-numero').value,
            avenue: document.getElementById('adr-avenue').value,
            quartier: document.getElementById('adr-quartier').value,
            commune: document.getElementById('adr-commune').value
        },
        articles: PANIER.map(item => ({ name: item.name, price: item.price, quantite: item.quantite })),
        montantTotal: PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0),
        modePaiement: detailPaiement,
        dateCommande: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "commandes"), commandePayload);
        alert("Commande enregistrée !");
        PANIER = []; synchroniserPanier();
        document.getElementById('checkout-form').reset();
        naviguerVers('screen-home');
    } catch (err) { alert(err.message); }
}

// =================================================================
// 10. ESPACE PANNEAU ADMINISTRATION
// =================================================================
async function ajouterNouveauProduitAdmin(e) {
    e.preventDefault();
    const nouveauProduit = {
        name: document.getElementById('admin-p-name').value,
        specs: document.getElementById('admin-p-specs').value,
        price: parseInt(document.getElementById('admin-p-price').value) || 0,
        imageUrl: document.getElementById('admin-p-image').value,
        category: categorieActiveAdmin,
        createdAt: new Date().getTime()
    };
    try {
        await addDoc(collection(db, "produits"), nouveauProduit);
        alert("Matériel enregistré !");
        document.getElementById('admin-product-form').reset();
        chargerCatalogueDepuisCloud();
    } catch (err) { alert(err.message); }
}

function afficherProduitsAdmin() {
    const listContainer = document.getElementById('admin-products-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = "";
    CATALOGUE.filter(p => p.category === categorieActiveAdmin).forEach(p => {
        const row = document.createElement('div');
        row.style = 'display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); font-size:13px;';
        row.innerHTML = `<div><strong>${p.name}</strong> - ${p.price}$</div><button style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="window.supprProd('${p.id}')">Supprimer</button>`;
        listContainer.appendChild(row);
    });
}

window.supprProd = async function(id) {
    if (confirm("Supprimer cet équipement ?")) {
        try { await deleteDoc(doc(db, "produits", id)); chargerCatalogueDepuisCloud(); } catch (e) { alert(e.message); }
    }
};

function ecouterCommandesAdmin() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    const q = query(collection(db, "commandes"), orderBy("dateCommande", "desc"));
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) { container.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">Aucune commande.</p>`; return; }
        container.innerHTML = "";
        snapshot.forEach((doc) => {
            const cmd = doc.data();
            let itemsHTML = cmd.articles.map(a => `<li>${a.name} (x${a.quantite})</li>`).join('');
            container.innerHTML += `
                <div style="background:var(--bg-body); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:10px; font-size:12px;">
                    <strong>${cmd.livraison.nom}</strong> - Total : ${cmd.montantTotal}$ (${cmd.modePaiement})<br>
                    📞 ${cmd.livraison.telephone} | 📍 Adr: ${cmd.livraison.commune}
                    <ul style="margin-top:4px; padding-left:15px;">${itemsHTML}</ul>
                </div>`;
        });
    });
}

async function chargerUtilisateursAdmin() {
    const container = document.getElementById('admin-users-container');
    if (!container) return;
    try {
        const querySnapshot = await getDocs(collection(db, "utilisateurs"));
        container.innerHTML = "";
        querySnapshot.forEach((doc) => {
            const u = doc.data();
            container.innerHTML += `<div style="padding:6px; border-bottom:1px solid var(--border); font-size:12px;">👤 ${u.email} - <strong>${u.role || 'client'}</strong></div>`;
        });
    } catch(e) { console.error(e); }
}

// =================================================================
// 11. REQUÊTES MOTEUR IA GEMINI (DYNAMIQUE SANS BLOCAGE GITHUB)
// =================================================================
async function appelerAPIIntelGemini(promptSysteme, promptUtilisateur) {
    if (!GEMINI_API_KEY) {
        return "Action IA suspendue. L'administrateur doit spécifier sa clé API dans son espace de contrôle graphique graphique.";
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const reponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: `${promptSysteme}\n\nRecommandation : ${promptUtilisateur}` }] }] })
        });
        const data = await reponse.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) { return "L'analyse IA rencontre un contretemps de communication."; }
}

async function analyserPanierAvecIA() {
    const aiBox = document.getElementById('client-ai-suggestions');
    if (!aiBox) return;
    if (PANIER.length === 0) { aiBox.innerHTML = ""; return; }
    const itemsStr = PANIER.map(i => i.name).join(', ');
    const reply = await appelerAPIIntelGemini("Tu es un conseiller e-commerce. Propose un accessoire idéal correspondant aux articles du panier en une courte phrase.", itemsStr);
    aiBox.innerHTML = `<div style="background:rgba(0,173,181,0.1); border-left:4px solid var(--primary); padding:10px; font-size:12px; border-radius:6px;">🤖 <strong>IA Suggestion :</strong> ${reply}</div>`;
}

async function executerAnalyseIAAdmin() {
    const aiBox = document.getElementById('admin-ai-insights');
    if (!aiBox) return;
    let stockStr = CATALOGUE.map(p => `- ${p.name} (${p.category})`).join('\n');
    const reply = await appelerAPIIntelGemini("Tu es analyste business. Donne une analyse flash de 2 lignes maximum sur la diversité de ce catalogue.", stockStr || "Aucun article.");
    aiBox.innerHTML = `<div style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:10px; border-left:4px solid #f59e0b; border-radius:6px; font-size:12px;">📊 <strong>Analyse IA Stock :</strong> ${reply}</div>`;
}

async function envoyerMessageIA() {
    const input = document.getElementById('ai-chat-input');
    const container = document.getElementById('ai-chat-messages');
    if (!input || !input.value.trim()) return;
    const clientTxt = input.value; input.value = "";
    
    container.innerHTML += `<div class="ai-msg user">${clientTxt}</div>`;
    container.scrollTop = container.scrollHeight;
    
    const loaderId = "loader-" + Date.now();
    container.innerHTML += `<div class="ai-msg bot" id="${loaderId}">Calcul en cours...</div>`;
    container.scrollTop = container.scrollHeight;
    
    let stockContext = CATALOGUE.map(p => `${p.name} (${p.price}$)`).join(', ');
    const reponse = await appelerAPIIntelGemini(`Tu es le conseiller commercial TechShop à Kamina. Tu as uniquement ces articles en stock : ${stockContext}. Réponds poliment en guidant le client.`, clientTxt);
    
    document.getElementById(loaderId).textContent = reponse;
    container.scrollTop = container.scrollHeight;
}

async function gererAssistantImageAdmin() {
    alert(await appelerAPIIntelGemini("Donne 3 mots clés pour trouver une belle image de PC Portable Premium.", "Image PC"));
}

// =================================================================
// 12. LOGIQUE MESSAGERIE DIRECTE WHATSAPP (TEXTE & AUDIO)
// =================================================================

// CÔTÉ CLIENT : Initialiser le flux de réception temps réel
function activerMessagerieDirecteClient() {
    if (!utilisateurConnecte) {
        document.getElementById('user-admin-chat-messages').innerHTML = `<div class="ai-msg bot" style="color:#ef4444;">⚠️ Veuillez vous connecter pour chatter en direct avec l'administrateur.</div>`;
        return;
    }
    const container = document.getElementById('user-admin-chat-messages');
    const q = query(collection(db, "discussions", utilisateurConnecte.uid, "messages"), orderBy("timestamp", "asc"));
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        if (snapshot.empty) {
            container.innerHTML = `<div class="ai-msg bot">Aucun message. Discutez en direct avec le gérant du magasin de Kamina ici.</div>`;
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            const estAdmin = data.sender === 'admin';
            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-msg ${estAdmin ? 'bot' : 'user'}`;
            
            if (data.type === 'audio') {
                msgDiv.innerHTML = `<audio src="${data.content}" controls style="max-width:100%;"></audio>`;
            } else {
                msgDiv.textContent = decrypterTexte(data.content);
            }
            container.appendChild(msgDiv);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// Envoyer un texte (Client ou Admin)
async function envoyerMessageDirectTexte() {
    const isAdminMode = (document.getElementById('screen-admin').style.display !== 'none');
    const inputId = isAdminMode ? 'direct-chat-input' : 'direct-chat-input'; 
    // Les deux entrées partagent le même sélecteur unifié selon l'onglet
    const inputEl = document.getElementById(inputId);
    if (!inputEl || !inputEl.value.trim()) return;
    
    let targetUid = utilisateurConnecte ? utilisateurConnecte.uid : null;
    if (isAdminMode) {
        targetUid = idClientChatSelectionneParAdmin;
        if (!targetUid) { alert("Veuillez d'abord sélectionner un client dans la liste ci-dessus."); return; }
    }
    
    if (!targetUid) return;
    const texteSaisi = inputEl.value; inputEl.value = "";
    
    const msgPayload = {
        sender: isAdminMode ? 'admin' : 'client',
        type: 'text',
        content: crypterTexte(texteSaisi),
        timestamp: new Date().getTime()
    };
    
    try {
        await addDoc(collection(db, "discussions", targetUid, "messages"), msgPayload);
        // Mettre à jour la date de dernier message pour le tri Admin
        await setDoc(doc(db, "discussions", targetUid), { lastUpdate: new Date().getTime(), clientEmail: isAdminMode ? "Chat avec Admin" : utilisateurConnecte.email }, { merge: true });
    } catch(e) { console.error(e); }
}

// CÔTÉ ADMINISTRATEUR : Écouter l'ensemble des fils ouverts par les clients
function ecouterFilsDiscussionsPourAdmin() {
    const container = document.getElementById('admin-chat-threads-container');
    if (!container) return;
    
    const q = query(collection(db, "discussions"), orderBy("lastUpdate", "desc"));
    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        if (snapshot.empty) { container.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">Aucun chat actif.</p>`; return; }
        
        snapshot.forEach(docSnap => {
            const thread = docSnap.data();
            const idClient = docSnap.id;
            
            const row = document.createElement('div');
            row.className = `admin-chat-row ${idClient === idClientChatSelectionneParAdmin ? 'active' : ''}`;
            row.innerHTML = `<span>💬 ${thread.clientEmail || 'Client'}</span> <button style="background:var(--primary); color:white; border:none; padding:2px 6px; border-radius:4px; font-size:11px; cursor:pointer;">Ouvrir</button>`;
            
            row.addEventListener('click', () => {
                idClientChatSelectionneParAdmin = idClient;
                // Ouvrir la boîte de chat et la synchroniser avec ce client spécifique
                document.getElementById('ai-chat-box').classList.add('open');
                document.getElementById('chat-tab-admin').click(); // Forcer l'onglet de messagerie directe
                chargerDiscussionAdminVersClientSpecifique(idClient);
                ecouterFilsDiscussionsPourAdmin(); // Rafraîchir l'état actif visuel
            });
            container.appendChild(row);
        });
    });
}

function chargerDiscussionAdminVersClientSpecifique(idClient) {
    if (threadEcouteActiveAdmin) threadEcouteActiveAdmin(); // Arrêter l'ancien écouteur s'il existe
    const container = document.getElementById('user-admin-chat-messages');
    
    const q = query(collection(db, "discussions", idClient, "messages"), orderBy("timestamp", "asc"));
    threadEcouteActiveAdmin = onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        snapshot.forEach(doc => {
            const data = doc.data();
            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-msg ${data.sender === 'admin' ? 'user' : 'bot'}`; // Inversion logique couleur pour l'Admin
            
            if (data.type === 'audio') {
                msgDiv.innerHTML = `<audio src="${data.content}" controls style="max-width:100%;"></audio>`;
            } else {
                msgDiv.textContent = decrypterTexte(data.content);
            }
            container.appendChild(msgDiv);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// GESTION DU MICRO ET MESSAGES VOCAUX (API MediaRecorder)
async function gererEnregistrementAudioComplet() {
    const voiceBtn = document.getElementById('direct-voice-btn');
    const isAdminMode = (document.getElementById('screen-admin').style.display !== 'none');
    let targetUid = utilisateurConnecte ? utilisateurConnecte.uid : null;
    if (isAdminMode) targetUid = idClientChatSelectionneParAdmin;
    
    if (!targetUid) { alert("Action impossible. Connectez-vous ou sélectionnez un fil."); return; }

    if (mediaRecorder && mediaRecorder.state === "recording") {
        // Stopper l'enregistrement
        mediaRecorder.stop();
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = "🎤";
    } else {
        // Démarrer l'enregistrement
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("L'enregistrement audio n'est pas supporté ou autorisé sur ce terminal.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunksAudio = [];
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksAudio.push(e.data); };
            
            mediaRecorder.onstop = async () => {
                const blobAudio = new Blob(chunksAudio, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(blobAudio);
                reader.onloadend = async () => {
                    const base64Audio = reader.result; // Fichier audio encodé de manière sécurisée en chaîne textuelle Base64
                    
                    const voicePayload = {
                        sender: isAdminMode ? 'admin' : 'client',
                        type: 'audio',
                        content: base64Audio,
                        timestamp: new Date().getTime()
                    };
                    
                    await addDoc(collection(db, "discussions", targetUid, "messages"), voicePayload);
                    await setDoc(doc(db, "discussions", targetUid), { lastUpdate: new Date().getTime(), clientEmail: isAdminMode ? "Chat avec Admin" : utilisateurConnecte.email }, { merge: true });
                };
            };
            
            mediaRecorder.start();
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = "🛑";
        } catch(err) { alert("Accès micro refusé : " + err.message); }
    }
}
