// =================================================================
// 1. CONFIGURATION & INITIALISATION DE FIREBASE MODULES
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCPKbw-M_fbEUtoelAw5L3GI8mKXJILfyA",
    authDomain: "techshop-kamina.firebaseapp.com",
    projectId: "techshop-kamina",
    storageBucket: "techshop-kamina.firebasestorage.app",
    messagingSenderId: "400768708816",
    appId: "1:400768708816:web:38e99cb2a9cd81c9ff2ed5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

    // Liaison Formulaire Authentification
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

// Événement clic bouton Connexion/Déconnexion Navbar
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
        alert("Erreur: " + err.message);
    }
}

// =================================================================
// 8. FONCTIONS PANIER & LOGIQUE D'ACHAT
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
    ouvrirPanier();
}

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
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '10px';
            row.innerHTML = `
                <div>
                    <h4 style="margin:0;font-size:14px;">${item.name}</h4>
                    <small>${item.price}$ x ${item.quantite}</small>
                </div>
                <div>
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', -1)">-</button>
                    <button class="qty-btn" onclick="window.modifierQte('${item.id}', 1)">+</button>
                </div>
            `;
            container.appendChild(row);
        });
    }
}

window.modifierQte = function(id, mod) {
    const item = PANIER.find(i => i.id === id);
    if (!item) return;
    item.quantite += mod;
    if (item.quantite <= 0) PANIER = PANIER.filter(i => i.id !== id);
    synchroniserPanier();
};

function preparerEcranCheckout() {
    const summaryContainer = document.getElementById('checkout-summary-items');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = "";
    
    PANIER.forEach(item => {
        summaryContainer.innerHTML += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>${item.name} (x${item.quantite})</span><span>${item.price * item.quantite} $</span></div>`;
    });
    const total = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    document.getElementById('summary-subtotal').textContent = total + " $";
    document.getElementById('summary-total').textContent = total + " $";
}

async function validerCommandeFinale(e) {
    e.preventDefault();
    const modePaiement = document.querySelector('input[name="payment"]:checked').value;
    
    const commandePayload = {
        clientUid: utilisateurConnecte.uid,
        clientEmail: utilisateurConnecte.email,
        livraison: {
            nom: document.getElementById('nom').value,
            telephone: "+243" + document.getElementById('telephone').value,
            commune: document.getElementById('adr-commune').value
        },
        articles: PANIER,
        montantTotal: PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0),
        dateCommande: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "commandes"), commandePayload);
        alert("Commande enregistrée avec succès !");
        PANIER = [];
        synchroniserPanier();
        naviguerVers('screen-home');
    } catch (err) {
        alert("Erreur commande : " + err.message);
    }
}

// =================================================================
// 9. LOGIQUE ADMINISTRATION FIRESTORE
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
        row.style.padding = '10px';
        row.style.borderBottom = '1px solid var(--border)';
        row.innerHTML = `
            <div><strong>${p.name}</strong> - ${p.price} $</div>
            <button style="background:#ef4444;color:white;border:none;padding:5px;cursor:pointer;" onclick="window.supprProd('${p.id}')">Supprimer</button>
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

async function chargerUtilisateursAdmin() {
    const container = document.getElementById('admin-users-container');
    if (!container) return;
    try {
        const querySnapshot = await getDocs(collection(db, "utilisateurs"));
        container.innerHTML = "";
        querySnapshot.forEach((doc) => {
            const u = doc.data();
            container.innerHTML += `<div style="padding:8px;border-bottom:1px solid var(--border)">👤 ${u.email} - <strong>${u.role || 'client'}</strong></div>`;
        });
    } catch (e) {
        console.error(e);
    }
}
