// =================================================================
// 1. CONFIGURATION & INITIALISATION DE FIREBASE & GEMINI MODULES
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Clé API Gemini du Client
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
// 3. SYSTEME DE ROUTAGE
// =================================================================
function naviguerVers(idEcran) {
    fermerPanier();
    document.querySelectorAll('.app-screen').forEach(screen => screen.style.display = 'none');
    const ecranCible = document.getElementById(idEcran);
    if (ecranCible) {
        ecranCible.style.display = (idEcran === 'screen-checkout' || idEcran === 'screen-admin') ? 'grid' : 'block';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =================================================================
// 4. CHARGEMENT ET ATTACHE DES EVENEMENTS (DOM)
// =================================================================
window.addEventListener('DOMContentLoaded', () => {
    const logo = document.getElementById('main-logo-btn');
    if (logo) logo.addEventListener('click', () => naviguerVers('screen-home'));

    // Panier Contrôles (Ouverture stricte au Clic uniquement)
    const openCartBtn = document.getElementById('open-cart-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const overlay = document.getElementById('sidebar-overlay');
    if (openCartBtn) openCartBtn.addEventListener('click', ouvrirPanier);
    if (closeCartBtn) closeCartBtn.addEventListener('click', fermerPanier);
    if (overlay) overlay.addEventListener('click', fermerPanier);

    const proceedBtn = document.getElementById('proceed-to-checkout-btn');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            if (PANIER.length === 0) return alert("Votre panier est vide !");
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

    // Gestion formulaires
    document.getElementById('auth-form')?.addEventListener('submit', gererSoumissionAuth);
    document.getElementById('checkout-form')?.addEventListener('submit', validerCommandeFinale);
    document.getElementById('admin-product-form')?.addEventListener('submit', ajouterNouveauProduitAdmin);

    document.getElementById('link-switch-auth')?.addEventListener('click', (e) => {
        e.preventDefault(); modeInscription = !modeInscription; basculerFormulaireAuth();
    });

    // Catégories Client
    document.querySelectorAll('.categories-container .filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.categories-container .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categorieActiveClient = this.getAttribute('data-category');
            afficherCatalogueClient();
        });
    });

    document.getElementById('search-input')?.addEventListener('input', filtrerRecherche);

    // Onglets Espace Admin
    const tabsAdmin = { 'tab-computers': 'Ordinateurs', 'tab-smartphones': 'Smartphones', 'tab-accessories': 'Accessoires' };
    Object.keys(tabsAdmin).forEach(idTab => {
        document.getElementById(idTab)?.addEventListener('click', function() {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categorieActiveAdmin = tabsAdmin[idTab];
            const t = document.getElementById('form-admin-title');
            if (t) t.textContent = "Ajouter un produit dans : " + categorieActiveAdmin;
            afficherProduitsAdmin();
        });
    });

    // Écouteurs de l'Intelligence Artificielle (Gemini Chatbot UI)
    document.getElementById('ai-toggle-btn')?.addEventListener('click', () => {
        const win = document.getElementById('ai-chat-window');
        win.style.display = (win.style.display === 'flex') ? 'none' : 'flex';
    });
    document.getElementById('ai-close-btn')?.addEventListener('click', () => {
        document.getElementById('ai-chat-window').style.display = 'none';
    });
    document.getElementById('ai-send-btn')?.addEventListener('click', envoyerMessageIA);
    document.getElementById('ai-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') envoyerMessageIA(); });

    // Mode Sombre
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }

    synchroniserPanier();
    chargerCatalogueDepuisCloud();
});

// =================================================================
// 5. SESSION MONITORING & CHARGEMENT COMMANDES ADMIN
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
                chargerCommandesAdmin(); // Charger le flux des commandes reçues
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

if (document.getElementById('auth-nav-btn')) {
    document.getElementById('auth-nav-btn').addEventListener('click', () => {
        if (utilisateurConnecte) {
            signOut(auth).then(() => { alert("Déconnexion réussie."); naviguerVers('screen-home'); });
        } else {
            modeInscription = false; basculerFormulaireAuth(); naviguerVers('screen-auth');
        }
    });
}

// =================================================================
// 6. SYNCHRONISATION FIRESTORE ET INSTANCIATION ALIBABA VIEW
// =================================================================
async function chargerCatalogueDepuisCloud() {
    try {
        const querySnapshot = await getDocs(collection(db, "produits"));
        CATALOGUE = [];
        querySnapshot.forEach(doc => CATALOGUE.push({ id: doc.id, ...doc.data() }));
        afficherCatalogueClient();
        if (utilisateurConnecte) afficherProduitsAdmin();
    } catch (e) { console.error(e); }
}

function afficherCatalogueClient() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";
    const f = CATALOGUE.filter(p => categorieActiveClient === "tous" || p.category === categorieActiveClient);
    if (f.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">Aucun produit disponible.</p>`;
        return;
    }
    f.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.imageUrl || 'https://via.placeholder.com/150'}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-specs">${p.specs || ''}</p>
                <div class="product-footer">
                    <span class="product-price">${p.price} $</span>
                    <button class="add-to-cart-btn" data-id="${p.id}">🛒+ </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    container.querySelectorAll('.add-to-cart-btn').forEach(b => b.addEventListener('click', function() { ajouterAuPanier(this.getAttribute('data-id')); }));
}

function filtrerRecherche() {
    const c = this.value.toLowerCase();
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";
    CATALOGUE.filter(p => p.name.toLowerCase().includes(c) || p.specs?.toLowerCase().includes(c)).forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <img src="${p.imageUrl || 'https://via.placeholder.com/150'}" class="product-image">
            <div class="product-info">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-specs">${p.specs || ''}</p>
                <div class="product-footer">
                    <span class="product-price">${p.price} $</span>
                    <button class="add-to-cart-btn" data-id="${p.id}">🛒+</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// =================================================================
// 7. PANIER CONTROLE STRICTE
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
    const item = CATALOGUE.find(p => p.id === id);
    if (!item) return;
    const ex = PANIER.find(i => i.id === id);
    if (ex) { ex.quantite++; } else { PANIER.push({ ...item, quantite: 1 }); }
    synchroniserPanier();
    // Le panier reste fermé lors d'un ajout, s'affiche uniquement lors du clic sur l'icône de navigation.
}

function synchroniserPanier() {
    localStorage.setItem('panier', JSON.stringify(PANIER));
    const count = PANIER.reduce((s, i) => s + i.quantite, 0);
    const total = PANIER.reduce((s, i) => s + (i.price * i.quantite), 0);
    if (document.getElementById('cart-count')) document.getElementById('cart-count').textContent = count;
    if (document.getElementById('cart-total')) document.getElementById('cart-total').textContent = total + " $";
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    if (PANIER.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Votre panier est vide.</p>`;
    } else {
        container.innerHTML = "";
        PANIER.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div><h4 style="font-size:12px;margin:0;">${item.name}</h4><small>${item.price}$ x ${item.quantite}</small></div>
                <div>
                    <button class="qty-btn" onclick="window.modQ('${item.id}', -1)">-</button>
                    <button class="qty-btn" onclick="window.modQ('${item.id}', 1)">+</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

window.modQ = function(id, m) {
    const i = PANIER.find(x => x.id === id); if (!i) return;
    i.quantite += m; if (i.quantite <= 0) PANIER = PANIER.filter(x => x.id !== id);
    synchroniserPanier();
};

// =================================================================
// 8. SOUMISSION DES COMMANDES ET SUIVI ADMINISTRATEUR
// =================================================================
function preparerEcranCheckout() {
    const sc = document.getElementById('checkout-summary-items'); if (!sc) return;
    sc.innerHTML = "";
    PANIER.forEach(i => { sc.innerHTML += `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>${i.name} (x${i.quantite})</span><span>${i.price * i.quantite} $</span></div>`; });
    const t = PANIER.reduce((s, i) => s + (i.price * i.quantite), 0);
    document.getElementById('summary-subtotal').textContent = t + " $";
    document.getElementById('summary-total').textContent = t + " $";
}

async function validerCommandeFinale(e) {
    e.preventDefault();
    const mode = document.querySelector('input[name="payment"]:checked').value;
    const payload = {
        clientUid: utilisateurConnecte.uid,
        clientEmail: utilisateurConnecte.email,
        livraison: {
            nom: document.getElementById('nom').value,
            telephone: "+243" + document.getElementById('telephone').value,
            commune: document.getElementById('adr-commune').value
        },
        articles: PANIER,
        montantTotal: PANIER.reduce((s, i) => s + (i.price * i.quantite), 0),
        paiement: { methode: mode, statut: "En attente", destinataire: "+243972177681" },
        dateCommande: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "commandes"), payload);
        alert("Félicitations ! Votre commande a été transmise avec succès.");
        PANIER = []; synchroniserPanier(); naviguerVers('screen-home');
    } catch (err) { alert(err.message); }
}

// Fonction de lecture des commandes pour l'admin
async function chargerCommandesAdmin() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    container.innerHTML = "<p style='color:var(--text-muted);font-size:12px;'>Flux des transactions en cours...</p>";
    try {
        const snap = await getDocs(collection(db, "commandes"));
        container.innerHTML = "";
        if (snap.empty) { container.innerHTML = "<p style='color:var(--text-muted);'>Aucune commande enregistrée pour le moment.</p>"; return; }
        snap.forEach(doc => {
            const c = doc.data();
            let listItems = c.articles.map(a => `${a.name} (x${a.quantite})`).join(', ');
            const box = document.createElement('div');
            box.className = 'commande-box';
            box.innerHTML = `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:5px;">
                    <strong>Client : ${c.livraison.nom}</strong>
                    <span style="color:var(--primary);font-weight:700;">${c.montantTotal} $</span>
                </div>
                <div>📞 Tél : ${c.livraison.telephone} | 📍 Ville : ${c.livraison.commune}</div>
                <div style="margin-top:4px;color:var(--text-muted);">📦 Articles : ${listItems}</div>
                <div style="margin-top:4px;font-size:11px;">💳 Paiement : <span style="color:var(--accent);font-weight:bold;">${c.paiement.methode}</span></div>
            `;
            container.appendChild(box);
        });
    } catch (err) { console.error(err); }
}

// =================================================================
// 9. RECOMMANDATION INTELLIGENTE (INTEGRATION GEMINI IA)
// =================================================================
async function envoyerMessageIA() {
    const inputEl = document.getElementById('ai-input');
    const msgContainer = document.getElementById('ai-chat-messages');
    const texteClient = inputEl.value.trim();
    if (!texteClient) return;

    // Affichage bulle utilisateur
    msgContainer.innerHTML += `<div class="msg-bubble user">${texteClient}</div>`;
    inputEl.value = "";
    msgContainer.scrollTop = msgContainer.scrollHeight;

    // Bulle de chargement IA
    const aiLoadingId = "ai-loading-" + Date.now();
    msgContainer.innerHTML += `<div class="msg-bubble ai" id="${aiLoadingId}">En attente de réponse...</div>`;

    // Structuration du contexte des stocks pour Gemini
    const stockContexte = CATALOGUE.map(p => `Produit: ${p.name}, Catégorie: ${p.category}, Prix: ${p.price}$, Specs: ${p.specs}`).join("\n");
    
    const promptSysteme = `
        Tu es l'assistant de vente virtuel intelligent de la boutique informatique TechShop située à Kamina. 
        Voici l'état en temps réel de notre stock d'équipements :
        ${stockContexte}
        
        Réponds de manière cordiale, professionnelle et concise en français aux questions des clients. Aide-les à faire le meilleur choix technologique uniquement à partir des produits présents dans notre liste ci-dessus. Si un composant n'est pas disponible, propose une alternative proche de notre stock.
        Question du client : ${texteClient}
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptSysteme }] }] })
        });
        const data = await response.json();
        const reponseIA = data.candidates[0].content.parts[0].text;
        
        document.getElementById(aiLoadingId).textContent = reponseIA;
    } catch (e) {
        document.getElementById(aiLoadingId).textContent = "Désolé, une erreur de communication est survenue avec le module d'intelligence artificielle.";
    }
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

// =================================================================
// 10. AUTH & FONCTIONS COMPLEMENTAIRES ADMIN
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
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, "utilisateurs", cred.user.uid), { email: email, role: "client", createdAt: serverTimestamp() });
            alert("Compte client créé avec succès !");
        } else { await signInWithEmailAndPassword(auth, email, pass); }
        document.getElementById('auth-form').reset(); naviguerVers('screen-home');
    } catch (err) { alert(err.message); }
}

async function ajouterNouveauProduitAdmin(e) {
    e.preventDefault();
    const np = {
        name: document.getElementById('admin-p-name').value,
        specs: document.getElementById('admin-p-specs').value,
        price: parseInt(document.getElementById('admin-p-price').value) || 0,
        imageUrl: document.getElementById('admin-p-image').value,
        category: categorieActiveAdmin,
        createdAt: new Date().getTime()
    };
    try {
        await addDoc(collection(db, "produits"), np);
        alert("Produit ajouté avec succès !");
        document.getElementById('admin-product-form').reset(); chargerCatalogueDepuisCloud();
    } catch (err) { alert(err.message); }
}

function afficherProduitsAdmin() {
    const lc = document.getElementById('admin-products-list-container'); if (!lc) return;
    lc.innerHTML = "";
    CATALOGUE.filter(p => p.category === categorieActiveAdmin).forEach(p => {
        const row = document.createElement('div');
        row.style = 'display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border);font-size:13px;';
        row.innerHTML = `<div><strong>${p.name}</strong> - ${p.price}$</div><button style="background:#ef4444;color:white;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;" onclick="window.delP('${p.id}')">Supprimer</button>`;
        lc.appendChild(row);
    });
}

window.delP = async function(id) {
    if (confirm("Retirer ce produit ?")) { try { await deleteDoc(doc(db, "produits", id)); chargerCatalogueDepuisCloud(); } catch (e) { alert(e.message); } }
};

async function chargerUtilisateursAdmin() {
    const c = document.getElementById('admin-users-container'); if (!c) return;
    try {
        const snap = await getDocs(collection(db, "utilisateurs")); c.innerHTML = "";
        snap.forEach(doc => { const u = doc.data(); c.innerHTML += `<div style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">👤 ${u.email} - <strong>${u.role || 'client'}</strong></div>`; });
    } catch (e) { console.error(e); }
}
