// =================================================================
// 1. CONFIGURATION & INITIALISATION DE FIREBASE MODULES
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Clé API Gemini fournie par l'utilisateur
const GEMINI_API_KEY = "AQ.Ab8RN6LlebEj3dVD23jlUJEeWR3vfgYlz6a6i_sHUPHyd4q7aw";

// =================================================================
// 2. ÉTATS GLOBAUX
// =================================================================
let CATALOGUE = [];
let PANIER = JSON.parse(localStorage.getItem('panier')) || [];
let categorieActiveClient = "tous";
let categorieActiveAdmin = "Ordinateurs";
let modeInscription = false;
let utilisateurConnecte = null;

// =================================================================
// 3. SYSTÈME DE ROUTAGE SÉCURISÉ
// =================================================================
function naviguerVers(idEcran) {
    fermerPanier();
    document.querySelectorAll('.app-screen').forEach(screen => {
        screen.style.display = 'none';
    });
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
// 4. CHARGEMENT INITIAL ET ÉCOUTEURS D'ÉVÉNEMENTS
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
    // Liaison Logo Accueil
    const logo = document.getElementById('main-logo-btn');
    if (logo) logo.addEventListener('click', () => naviguerVers('screen-home'));

    // Liaison Panier Événements
    const openCartBtn = document.getElementById('open-cart-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const overlay = document.getElementById('sidebar-overlay');
    const proceedBtn = document.getElementById('proceed-to-checkout-btn');
    
    if (openCartBtn) openCartBtn.addEventListener('click', ouvrirPanier);
    if (closeCartBtn) closeCartBtn.addEventListener('click', fermerPanier);
    if (overlay) overlay.addEventListener('click', fermerPanier);
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            if (PANIER.length === 0) {
                alert("Votre panier est vide !");
                return;
            }
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

    // Gestion de la visibilité du mot de passe (Œil)
    const togglePasswordBtn = document.getElementById('toggle-password-visibility');
    const passwordInput = document.getElementById('auth-password');
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    // Liaison Formulaire Authentification
    const authForm = document.getElementById('auth-form');
    if (authForm) authForm.addEventListener('submit', gererSoumissionAuth);
    
    // Liaison Initiale du bouton Switch d'authentification
    const linkSwitch = document.getElementById('link-switch-auth');
    if (linkSwitch) {
        linkSwitch.addEventListener('click', (e) => {
            e.preventDefault();
            modeInscription = !modeInscription;
            basculerFormulaireAuth();
        });
    }

    // Liaison Formulaire Checkout
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) checkoutForm.addEventListener('submit', validerCommandeFinale);
    const payMobile = document.getElementById('pay-mobile');
    const payCash = document.getElementById('pay-cash');
    if (payMobile) payMobile.addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'block'; });
    if (payCash) payCash.addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'none'; });

    // Liaison Catégories Client
    document.querySelectorAll('.categories-container .filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.categories-container .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categorieActiveClient = this.getAttribute('data-category');
            afficherCatalogueClient();
        });
    });

    // Liaison Recherche
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', filtrerRecherche);

    // Liaison Onglets Admin
    const tabsAdmin = { 'tab-computers': 'Ordinateurs', 'tab-smartphones': 'Smartphones', 'tab-accessories': 'Accessoires' };
    Object.keys(tabsAdmin).forEach(idTab => {
        const tabEl = document.getElementById(idTab);
        if (tabEl) {
            tabEl.addEventListener('click', function() {
                document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                categorieActiveAdmin = tabsAdmin[idTab];
                const formTitle = document.getElementById('form-admin-title');
                if (formTitle) formTitle.textContent = "Ajouter un produit dans : " + categorieActiveAdmin;
                afficherProduitsAdmin();
            });
        }
    });

    // Liaison Formulaire Ajout Produit Admin
    const adminProductForm = document.getElementById('admin-product-form');
    if (adminProductForm) adminProductForm.addEventListener('submit', ajouterNouveauProduitAdmin);

    // Liaison Assistance Image Admin IA
    const aiImgBtn = document.getElementById('admin-ai-img-btn');
    if (aiImgBtn) aiImgBtn.addEventListener('click', gererAssistantImageAdmin);

    // Liaison Boutons Assistant Chat IA Client
    const aiChatOpenBtn = document.getElementById('ai-chat-open-btn');
    const aiChatCloseBtn = document.getElementById('ai-chat-close-btn');
    const aiChatSendBtn = document.getElementById('ai-chat-send-btn');
    const aiChatInput = document.getElementById('ai-chat-input');
    if (aiChatOpenBtn) aiChatOpenBtn.addEventListener('click', () => { document.getElementById('ai-chat-box').classList.toggle('open'); });
    if (aiChatCloseBtn) aiChatCloseBtn.addEventListener('click', () => { document.getElementById('ai-chat-box').classList.remove('open'); });
    if (aiChatSendBtn) aiChatSendBtn.addEventListener('click', envoyerMessageIA);
    if (aiChatInput) aiChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') envoyerMessageIA(); });

    // Liaison Mode Sombre
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }

    // Lancement des données
    synchroniserPanier();
    chargerCatalogueDepuisCloud();
});

// =================================================================
// 5. SURVEILLANCE DE LA SESSION AUTHENTIFICATION
// =================================================================
onAuthStateChanged(auth, async (user) => {
    const authBtn = document.getElementById('auth-nav-btn');
    const adminBadge = document.getElementById('admin-badge');
    
    if (user) {
        utilisateurConnecte = user;
        if (authBtn) authBtn.textContent = "Déconnexion";
        
        try {
            const docRef = doc(db, "utilisateurs", user.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                if (adminBadge) adminBadge.style.display = 'inline-block';
                naviguerVers('screen-admin');
                chargerUtilisateursAdmin();
                ecouterCommandesAdmin();
                executerAnalyseIAAdmin();
            } else {
                if (adminBadge) adminBadge.style.display = 'none';
            }
        } catch (e) {
            console.error(e);
        }
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
            signOut(auth).then(() => {
                alert("Session déconnectée.");
                naviguerVers('screen-home');
            });
        } else {
            modeInscription = false;
            basculerFormulaireAuth();
            naviguerVers('screen-auth');
        }
    });
}

// =================================================================
// 6. FONCTIONS LOGIQUES DE L'APPLICATION
// =================================================================
async function chargerCatalogueDepuisCloud() {
    try {
        const querySnapshot = await getDocs(collection(db, "produits"));
        CATALOGUE = [];
        querySnapshot.forEach((doc) => {
            CATALOGUE.push({ id: doc.id, ...doc.data() });
        });
        afficherCatalogueClient();
        if (utilisateurConnecte) afficherProduitsAdmin();
    } catch (error) {
        console.error("Erreur de chargement Firestore :", error);
    }
}

function afficherCatalogueClient() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";
    const produitsFiltres = CATALOGUE.filter(p => categorieActiveClient === "tous" || p.category === categorieActiveClient);
    if (produitsFiltres.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Aucun équipement disponible.</p>`;
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
        btn.addEventListener('click', function() {
            ajouterAuPanier(this.getAttribute('data-id'));
        });
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
// 7. GESTION DE L'AUTHENTIFICATION
// =================================================================
function basculerFormulaireAuth() {
    document.getElementById('auth-title').textContent = modeInscription ? "Créer un compte" : "Connexion";
    document.getElementById('auth-submit-btn').textContent = modeInscription ? "S'inscrire" : "Se connecter";
    document.getElementById('auth-switch-text').innerHTML = modeInscription ? 
        `Déjà inscrit ? <a href="#" id="link-switch-auth">Se connecter</a>` : 
        `Pas encore de compte ? <a href="#" id="link-switch-auth">Créer un compte</a>`;
    
    // Réattacher l'œil si l'HTML change ou se réinitialise
    const togglePasswordBtn = document.getElementById('toggle-password-visibility');
    if (togglePasswordBtn) {
        togglePasswordBtn.textContent = '👁️';
        document.getElementById('auth-password').setAttribute('type', 'password');
    }

    document.getElementById('link-switch-auth').addEventListener('click', (e) => {
        e.preventDefault();
        modeInscription = !modeInscription;
        basculerFormulaireAuth();
    });
}

async function gererSoumissionAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    try {
        if (modeInscription) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, "utilisateurs", userCredential.user.uid), {
                email: email,
                role: "client",
                createdAt: serverTimestamp()
            });
            alert("Compte client créé avec succès !");
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
        document.getElementById('auth-form').reset();
        naviguerVers('screen-home');
    } catch (err) {
        alert("Erreur Authentification : " + err.message);
    }
}

// =================================================================
// 8. FONCTIONS PANIER & LOGIQUE D'ACHAT (CORRIGÉES POUR LOOK ALIBABA)
// =================================================================
function ouvrirPanier() { 
    document.getElementById('cart-sidebar').classList.add('open'); 
    document.getElementById('sidebar-overlay').classList.add('open'); 
}
function fermerPanier() { 
    document.getElementById('cart-sidebar').classList.remove('open'); 
    document.getElementById('sidebar-overlay').classList.remove('open'); 
}

/* Correction demandée : Le panier met à jour la quantité et l'état visuel mais ne s'ouvre PLUS automatiquement lors de l'ajout */
function ajouterAuPanier(id) {
    const itemStock = CATALOGUE.find(p => p.id === id);
    if (!itemStock) return;
    const existant = PANIER.find(item => item.id === id);
    if (existant) { 
        existant.quantite++; 
    } else { 
        PANIER.push({ ...itemStock, quantite: 1 }); 
    }
    synchroniserPanier();
    // ouvrirPanier(); <-- Retiré pour satisfaire la demande d'affichage moderne et non-intrusif
}

window.viderLePanierComplet = function() {
    if (confirm("Voulez-vous vraiment supprimer toute cette commande ?")) {
        PANIER = [];
        synchroniserPanier();
        fermerPanier();
    }
};

function synchroniserPanier() {
    localStorage.setItem('panier', JSON.stringify(PANIER));
    const totalItems = PANIER.reduce((sum, item) => sum + item.quantite, 0);
    const prixTotal = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    
    const countEl = document.getElementById('cart-count');
    const totalEl = document.getElementById('cart-total');
    if (countEl) countEl.textContent = totalItems;
    if (totalEl) totalEl.textContent = prixTotal + " $";
    
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    
    if (PANIER.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Votre panier est vide.</p>`;
    } else {
        container.innerHTML = "";
        PANIER.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.padding = '10px 0';
            row.style.borderBottom = '1px solid var(--border)';
            row.style.gap = '10px';
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <img src="${item.imageUrl || 'https://via.placeholder.com/50'}" alt="${item.name}" style="width:45px; height:45px; object-fit:cover; border-radius:6px; background:#fafafa;">
                    <div>
                        <h4 style="margin:0; font-size:13px; font-weight:600; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${item.name}</h4>
                        <small style="color:var(--text-muted); font-weight:500;">${item.price} $ x ${item.quantite}</small>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', -1)">-</button>
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', 1)">+</button>
                    <button onclick="window.retirerDuPanier('${item.id}')" style="background:none; border:none; color:#ef4444; font-size:14px; cursor:pointer; margin-left:4px;">❌</button>
                </div>
            `;
            container.appendChild(row);
        });

        if (!document.getElementById('btn-clear-cart-global')) {
            const clearBtnContainer = document.createElement('div');
            clearBtnContainer.id = 'btn-clear-cart-global';
            clearBtnContainer.style.padding = '15px 0 5px 0';
            clearBtnContainer.innerHTML = `
                <button onclick="window.viderLePanierComplet()" style="width: 100%; background: #ef4444; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size:13px;">
                    🗑️ Vider le panier complet
                </button>
            `;
            container.appendChild(clearBtnContainer);
        }
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

window.retirerDuPanier = function(id) {
    PANIER = PANIER.filter(i => i.id !== id);
    synchroniserPanier();
};

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
        const operateur = document.querySelector('input[name="operator"]:checked').value;
        detailPaiement += ` (${operateur})`;
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
        alert("Commande enregistrée avec succès ! Notre équipe va vous contacter pour la livraison.");
        PANIER = [];
        synchroniserPanier();
        document.getElementById('checkout-form').reset();
        naviguerVers('screen-home');
    } catch (err) {
        alert("Erreur commande : " + err.message);
    }
}

// =================================================================
// 9. LOGIQUE ADMINISTRATION FIRESTORE & ÉCOUTE TEMPS RÉEL
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
        alert("Produit ajouté au Cloud !");
        document.getElementById('admin-product-form').reset();
        chargerCatalogueDepuisCloud();
    } catch (err) {
        alert("Erreur d'ajout : " + err.message);
    }
}

function afficherProduitsAdmin() {
    const listContainer = document.getElementById('admin-products-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = "";
    const produitsFiltres = CATALOGUE.filter(p => p.category === categorieActiveAdmin);
    produitsFiltres.forEach(p => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '10px';
        row.style.borderBottom = '1px solid var(--border)';
        row.innerHTML = `
            <div style="font-size:13px;"><strong>${p.name}</strong> - ${p.price} $</div>
            <button style="background:#ef4444;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;" onclick="window.supprProd('${p.id}')">Supprimer</button>
        `;
        listContainer.appendChild(row);
    });
}

window.supprProd = async function(id) {
    if (confirm("Supprimer ce produit ?")) {
        try {
            await deleteDoc(doc(db, "produits", id));
            chargerCatalogueDepuisCloud();
        } catch (e) {
            alert(e.message);
        }
    }
};

function ecouterCommandesAdmin() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    const q = query(collection(db, "commandes"), orderBy("dateCommande", "desc"));
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Aucune commande disponible.</p>`;
            return;
        }
        container.innerHTML = "";
        snapshot.forEach((doc) => {
            const cmd = doc.data();
            let listeArticlesHTML = cmd.articles.map(a => `<li>${a.name} (x${a.quantite}) - ${a.price}$</li>`).join('');
            
            const card = document.createElement('div');
            card.className = 'admin-order-card';
            card.style.background = 'var(--bg-body)';
            card.style.border = '1px solid var(--border)';
            card.style.padding = '15px';
            card.style.borderRadius = '10px';
            card.style.marginBottom = '15px';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-weight:700; color:var(--primary);">Total : ${cmd.montantTotal} $</span>
                    <span style="font-size:12px; background:var(--accent); color:white; padding:2px 6px; border-radius:4px;">${cmd.modePaiement}</span>
                </div>
                <p style="margin:4px 0; font-size:13px;"><strong>Client:</strong> ${cmd.livraison.nom} (${cmd.clientEmail})</p>
                <p style="margin:4px 0; font-size:13px;"><strong>Tél:</strong> ${cmd.livraison.telephone}</p>
                <p style="margin:4px 0; font-size:13px;"><strong>Adresse:</strong> N°${cmd.livraison.numero}, Av. ${cmd.livraison.avenue}, Q/${cmd.livraison.quartier}, C/${cmd.livraison.commune}</p>
                <div style="margin-top:10px; font-size:13px; border-top:1px dashed var(--border); padding-top:8px;">
                    <strong>Articles commandés :</strong>
                    <ul style="padding-left:20px; margin-top:5px;">${listeArticlesHTML}</ul>
                </div>
            `;
            container.appendChild(card);
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
            container.innerHTML += `<div style="padding:8px;border-bottom:1px solid var(--border); font-size:13px;">👤 ${u.email} - <strong>${u.role || 'client'}</strong></div>`;
        });
    } catch (e) {
        console.error(e);
    }
}

// =================================================================
// 10. MOTEUR D'INTELLIGENCE ARTIFICIELLE (GEMINI API) - CLIENT & ADMIN
// =================================================================
async function appelerAPIIntelGemini(promptSysteme, promptUtilisateur) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const reponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${promptSysteme}\n\nQuestion / Recommandation : ${promptUtilisateur}` }]
                }]
            })
        });
        const data = await reponse.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Erreur API Gemini:", error);
        return "Désolé, je rencontre des difficultés techniques pour me connecter à mon cerveau IA.";
    }
}

async function analyserPanierAvecIA() {
    const aiBox = document.getElementById('client-ai-suggestions');
    if (!aiBox) return; 
    if (PANIER.length === 0) {
        aiBox.innerHTML = "";
        return;
    }
    const nomsArticles = PANIER.map(i => i.name).join(', ');
    const promptSysteme = "Tu es un conseiller technologique IA ultra-rapide. Tu vois les articles du panier actuel de l'utilisateur. Suggère en une seule phrase courte et percutante un accessoire logique manquant (ex: souris pour PC, pochette pour téléphone). Ne fais pas de listes.";
    
    const suggestion = await appelerAPIIntelGemini(promptSysteme, `Panier actuel : ${nomsArticles}`);
    aiBox.innerHTML = `<div style="background:rgba(0, 173, 181, 0.1); border-left:4px solid var(--primary); padding:12px; font-size:13px; border-radius:8px; margin-bottom:10px;">🤖 <strong>Conseil IA :</strong> ${suggestion}</div>`;
}

async function executerAnalyseIAAdmin() {
    const adminAiBox = document.getElementById('admin-ai-insights');
    if (!adminAiBox) return;
    adminAiBox.innerHTML = "<p style='font-size:13px; color:var(--text-muted);'>L'IA analyse le catalogue global...</p>";
    
    let descriptionStock = CATALOGUE.map(p => `- ${p.name} (${p.category}) : ${p.price}$`).join('\n');
    const promptSysteme = "Tu es un consultant en business intelligence expert en matériel informatique à Kamina. Examine le stock global fourni et génère un rapport concis (3 points maximum) contenant une alerte de réapprovisionnement et une suggestion marketing.";
    
    const rapport = await appelerAPIIntelGemini(promptSysteme, descriptionStock || "Aucun produit en stock actuellement.");
    adminAiBox.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; padding: 14px; border-left: 4px solid #f59e0b; border-radius: 8px; font-size: 13px;">
            <h4 style="margin:0 0 6px 0; font-size:14px; font-weight:700;">📊 Insights Prédictifs IA</h4>
            <div style="white-space: pre-line; line-height:1.4;">${rapport}</div>
        </div>
    `;
}

async function envoyerMessageIA() {
    const inputEl = document.getElementById('ai-chat-input');
    const msgContainer = document.getElementById('ai-chat-messages');
    if (!inputEl || !msgContainer || inputEl.value.trim() === "") return;
    const texteClient = inputEl.value;
    inputEl.value = "";
    
    msgContainer.innerHTML += `<div class="ai-msg user">${texteClient}</div>`;
    msgContainer.scrollTop = msgContainer.scrollHeight;
    
    let descriptionStock = CATALOGUE.map(p => `- Équipement: ${p.name}, Catégorie: ${p.category}, Caractéristiques: ${p.specs || 'N/A'}, Prix: ${p.price}$`).join('\n');
    
    const promptSysteme = `Tu es l'assistant de vente intelligent de la boutique TechShop basée à Kamina. Tu devez guider les acheteurs de manière sérieuse et commerciale. Voici notre stock réel extrait en temps réel de notre base de données : \n${descriptionStock}\n\nInstructions impératives :\n1. Ne propose OU ne conseille QUE des produits présents dans cette liste ci-dessus.\n2. Si un produit demandé n'est pas dans la liste, indique poliment qu'il est en rupture de stock et oriente-le vers un produit équivalent disponible.\n3. Réponds de manière concise, polie et professionnelle.`;
    
    const loaderId = "loader-" + Date.now();
    msgContainer.innerHTML += `<div class="ai-msg bot" id="${loaderId}">Réflexion en cours...</div>`;
    msgContainer.scrollTop = msgContainer.scrollHeight;
    const reponseIA = await appelerAPIIntelGemini(promptSysteme, texteClient);
    
    const loaderEl = document.getElementById(loaderId);
    if (loaderEl) loaderEl.textContent = reponseIA;
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

async function gererAssistantImageAdmin() {
    const promptSysteme = `Tu es un expert en UI/UX design et marketing e-commerce. L'administrateur de l'application TechShop à Kamina souhaite de l'aide pour optimiser ses fiches d'équipements ou trouver d'excellentes idées d'images professionnelles. Donne-lui 3 conseils d'URLs ou structures d'images parfaites pour vendre de la technologie haut de gamme.`;
    alert("Analyse de l'Assistant Admin IA :\n\n" + await appelerAPIIntelGemini(promptSysteme, "Donne-moi des conseils d'optimisation pour mes liens d'images de produits et l'analyse de fiches."));
}
