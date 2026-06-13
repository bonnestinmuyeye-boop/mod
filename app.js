// =================================================================
// 1. CONFIGURATION & INITIALISATION DE FIREBASE MODULES
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Tes identifiants réels récupérés depuis ton projet Firebase
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
// 2. ÉTATS GLOBAUX DE L'APPLICATION
// =================================================================
let CATALOGUE = [];
let PANIER = JSON.parse(localStorage.getItem('panier')) || [];
let categorieActiveClient = "tous";
let categorieActiveAdmin = "Ordinateurs";
let modeInscription = false;
let utilisateurConnecte = null;

// =================================================================
// 3. SYSTÈME DE ROUTAGE (CONTRÔLE DES ÉCRANS HTML)
// =================================================================
function naviguerVers(idEcran) {
    // Fermer le panier par précaution
    fermerPanier();
    
    // Masquer tous les écrans
    document.querySelectorAll('.app-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // Afficher l'écran sélectionné
    const ecranCible = document.getElementById(idEcran);
    if (ecranCible) {
        ecranCible.style.display = (idEcran === 'screen-checkout') ? 'grid' : ((idEcran === 'screen-admin') ? 'grid' : 'block');
    }
    
    // Remonter en haut de page automatiquement
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialisation des écouteurs de navigation
document.getElementById('main-logo-btn').addEventListener('click', () => naviguerVers('screen-home'));

// =================================================================
// 4. LOGIQUE D'AUTHENTIFICATION ET SÉCURISATION DES RÔLES
// =================================================================
const authBtn = document.getElementById('auth-nav-btn');
const linkSwitchAuth = document.getElementById('link-switch-auth');

// Surveillance de la session de l'utilisateur par Firebase
onAuthStateChanged(auth, async (user) => {
    const adminBadge = document.getElementById('admin-badge');
    if (user) {
        utilisateurConnecte = user;
        authBtn.textContent = "Déconnexion";
        
        // Aller chercher le rôle dans Firestore
        try {
            const docRef = doc(db, "utilisateurs", user.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                adminBadge.style.display = 'inline-block';
                naviguerVers('screen-admin');
                chargerUtilisateursAdmin();
            } else {
                adminBadge.style.display = 'none';
                if (document.getElementById('screen-auth').style.display !== 'none') {
                    naviguerVers('screen-home');
                }
            }
        } catch (e) {
            console.error("Erreur de rôle:", e);
        }
    } else {
        utilisateurConnecte = null;
        authBtn.textContent = "Connexion";
        adminBadge.style.display = 'none';
        if (document.getElementById('screen-admin').style.display !== 'none') {
            naviguerVers('screen-home');
        }
    }
    chargerCatalogueDepuisCloud();
});

// Bouton Connexion / Déconnexion de la barre supérieure
authBtn.addEventListener('click', () => {
    if (utilisateurConnecte) {
        signOut(auth).then(() => {
            alert("Session clôturée avec succès.");
            naviguerVers('screen-home');
        });
    } else {
        modeInscription = false;
        basculerFormulaireAuth();
        naviguerVers('screen-auth');
    }
});

// Switch entre connexion et inscription
linkSwitchAuth.addEventListener('click', (e) => {
    e.preventDefault();
    modeInscription = !modeInscription;
    basculerFormulaireAuth();
});

function basculerFormulaireAuth() {
    document.getElementById('auth-title').textContent = modeInscription ? "Créer un compte" : "Connexion";
    document.getElementById('auth-subtitle').textContent = modeInscription ? "Rejoignez TechShop pour suivre vos colis" : "Connectez-vous pour finaliser vos achats";
    document.getElementById('auth-submit-btn').textContent = modeInscription ? "S'inscrire" : "Se connecter";
    document.getElementById('auth-switch-text').innerHTML = modeInscription ? 
        `Déjà inscrit ? <a href="#" id="link-switch-auth-inner">Se connecter</a>` : 
        `Pas encore de compte ? <a href="#" id="link-switch-auth-inner">Créer un compte</a>`;
    
    document.getElementById('link-switch-auth-inner').addEventListener('click', (e) => {
        e.preventDefault();
        modeInscription = !modeInscription;
        basculerFormulaireAuth();
    });
}

// Soumission du formulaire d'authentification
document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;

    try {
        if (modeInscription) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            // Enregistrer le nouvel utilisateur comme client simple par défaut dans le cloud
            await setDoc(doc(db, "utilisateurs", userCredential.user.uid), {
                email: email,
                role: "client",
                createdAt: serverTimestamp()
            });
            alert("Votre compte client a bien été créé !");
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
        }
        document.getElementById('auth-form').reset();
    } catch (err) {
        alert("Erreur Authentification : " + err.message);
    }
});

// =================================================================
// 5. GESTION DU CATALOGUE CLIENT (LIGNE DIRECTE FIRESTORE)
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
        console.error("Erreur Firestore :", error);
    }
}

// Sélection de catégories côté client
document.querySelectorAll('.categories-container .filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.categories-container .filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        categorieActiveClient = this.getAttribute('data-category');
        afficherCatalogueClient();
    });
});

function afficherCatalogueClient() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = "";

    const produitsFiltres = CATALOGUE.filter(p => categorieActiveClient === "tous" || p.category === categorieActiveClient);

    if (produitsFiltres.length === 0) {
        container.innerHTML = `<p class="no-products" style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Aucun matériel n'est disponible dans cette catégorie pour le moment.</p>`;
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

    // Événement d'ajout au panier
    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            ajouterAuPanier(this.getAttribute('data-id'));
        });
    });
}

// Logique de recherche
document.getElementById('search-input').addEventListener('input', function() {
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
});

// =================================================================
// 6. LOGIQUE GLOBALE DU PANIER LATÉRAL
// =================================================================
const sidebar = document.getElementById('cart-sidebar');
const overlay = document.getElementById('sidebar-overlay');

document.getElementById('open-cart-btn').addEventListener('click', ouvrirPanier);
document.getElementById('close-cart-btn').addEventListener('click', fermerPanier);
overlay.addEventListener('click', fermerPanier);

function ouvrirPanier() { sidebar.classList.add('open'); overlay.classList.add('open'); }
function fermerPanier() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }

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
}

function modifierQuantiteItem(id, modification) {
    const item = PANIER.find(i => i.id === id);
    if (!item) return;
    item.quantite += modification;
    if (item.quantite <= 0) {
        PANIER = PANIER.filter(i => i.id !== id);
    }
    synchroniserPanier();
}

function synchroniserPanier() {
    localStorage.setItem('panier', JSON.stringify(PANIER));
    
    // Calcul et mise à jour des badges
    const totalItems = PANIER.reduce((sum, item) => sum + item.quantite, 0);
    const prixTotal = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    
    document.getElementById('cart-count').textContent = totalItems;
    document.getElementById('cart-total').textContent = prixTotal + " $";

    // Affichage des items dans la barre latérale
    const container = document.getElementById('cart-items-container');
    if (PANIER.length === 0) {
        container.innerHTML = `<p class="empty-cart-msg">Votre panier est vide.</p>`;
    } else {
        container.innerHTML = "";
        PANIER.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.marginBottom = '15px';
            row.innerHTML = `
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:14px;">${item.name}</h4>
                    <small style="color:var(--primary); font-weight:600;">${item.price} $ x ${item.quantite}</small>
                </div>
                <div style="display:flex; gap:5px; align-items:center;">
                    <button class="qty-btn minus" data-id="${item.id}" style="padding:2px 8px; cursor:pointer;">-</button>
                    <span>${item.quantite}</span>
                    <button class="qty-btn plus" data-id="${item.id}" style="padding:2px 8px; cursor:pointer;">+</button>
                </div>
            `;
            container.appendChild(row);
        });

        container.querySelectorAll('.qty-btn.minus').forEach(b => b.addEventListener('click', function() { modifierQuantiteItem(this.getAttribute('data-id'), -1); }));
        container.querySelectorAll('.qty-btn.plus').forEach(b => b.addEventListener('click', function() { modifierQuantiteItem(this.getAttribute('data-id'), 1); }));
    }
}

// Redirection vers l'écran de validation
document.getElementById('proceed-to-checkout-btn').addEventListener('click', () => {
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

// =================================================================
// 7. EXPÉDITION DE LA COMMANDE (CHECKOUT)
// =================================================================
function preparerEcranCheckout() {
    const summaryContainer = document.getElementById('checkout-summary-items');
    summaryContainer.innerHTML = "";
    
    PANIER.forEach(item => {
        const div = document.createElement('div');
        div.className = 'summary-item-row';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.marginBottom = '10px';
        div.innerHTML = `<span>${item.name} (x${item.quantite})</span><span>${item.price * item.quantite} $</span>`;
        summaryContainer.appendChild(div);
    });

    const total = PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0);
    document.getElementById('summary-subtotal').textContent = total + " $";
    document.getElementById('summary-total').textContent = total + " $";
}

// Gestion de l'affichage adaptatif des modes de paiement
document.getElementById('pay-mobile').addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'block'; });
document.getElementById('pay-cash').addEventListener('change', () => { document.getElementById('mobile-operators-section').style.display = 'none'; });

// Validation finale de la commande
document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const modePaiement = document.querySelector('input[name="payment"]:checked').value;
    let operateurSelect = "";
    if (modePaiement === 'mobile_money') {
        operateurSelect = document.querySelector('input[name="operator"]:checked').value;
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
            commune: document.getElementById('adr-commune').value,
        },
        articles: PANIER,
        montantTotal: PANIER.reduce((sum, item) => sum + (item.price * item.quantite), 0),
        paiement: {
            methode: modePaiement,
            operateur: operateurSelect,
            statut: "En attente"
        },
        dateCommande: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "commandes"), commandePayload);
        alert(`Félicitations ! Votre commande de ${commandePayload.montantTotal}$ a bien été enregistrée.\nNous vous contacterons sur le ${commandePayload.livraison.telephone}.`);
        PANIER = [];
        synchroniserPanier();
        document.getElementById('checkout-form').reset();
        naviguerVers('screen-home');
    } catch (err) {
        alert("Erreur lors de la validation de la commande : " + err.message);
    }
});

// =================================================================
// 8. ESPACE ADMINISTRATION AUTOMATISÉ (FIRESTORE ACTION)
// =================================================================

// Liens de basculement des onglets de catégories de l'admin
const tabsAdmin = {
    'tab-computers': 'Ordinateurs',
    'tab-smartphones': 'Smartphones',
    'tab-accessories': 'Accessoires'
};

Object.keys(tabsAdmin).forEach(idTab => {
    document.getElementById(idTab).addEventListener('click', function() {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        categorieActiveAdmin = tabsAdmin[idTab];
        document.getElementById('form-admin-title').textContent = "Ajouter un produit dans : " + categorieActiveAdmin;
        afficherProduitsAdmin();
    });
});

// Enregistrement d'un nouvel équipement
document.getElementById('admin-product-form').addEventListener('submit', async (e) => {
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
        alert("Équipement informatique synchronisé avec succès sur Cloud Firestore !");
        document.getElementById('admin-product-form').reset();
        chargerCatalogueDepuisCloud();
    } catch (err) {
        alert("Erreur Cloud : " + err.message);
    }
});

// Affichage dynamique du stock admin
function afficherProduitsAdmin() {
    const listContainer = document.getElementById('admin-products-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const produitsFiltres = CATALOGUE.filter(p => p.category === categorieActiveAdmin);

    if (produitsFiltres.length === 0) {
        listContainer.innerHTML = "<p style='color:var(--text-muted); font-size:14px;'>Aucun article en ligne dans cette catégorie.</p>";
        return;
    }

    produitsFiltres.forEach(p => {
        const row = document.createElement('div');
        row.className = 'admin-product-row';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '10px';
        row.style.background = 'var(--bg-body)';
        row.style.border = '1px solid var(--border)';
        row.style.borderRadius = '8px';
        row.style.marginBottom = '8px';
        row.innerHTML = `
            <div>
                <strong>${p.name}</strong> - <span style="color:var(--primary); font-weight:600;">${p.price} $</span>
                <br><small style="color:var(--text-muted);">${p.specs || ''}</small>
            </div>
            <button class="delete-p-btn" data-id="${p.id}" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Supprimer</button>
        `;
        listContainer.appendChild(row);
    });

    listContainer.querySelectorAll('.delete-p-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            supprimerEquipementAdmin(this.getAttribute('data-id'));
        });
    });
}

// Suppression réelle d'un produit du Cloud
async function supprimerEquipementAdmin(id) {
    if (confirm("Retirer définitivement cet équipement du catalogue Cloud ?")) {
        try {
            await deleteDoc(doc(db, "produits", id));
            alert("Article effacé du serveur avec succès !");
            chargerCatalogueDepuisCloud();
        } catch (error) {
            alert("Erreur suppression : " + error.message);
        }
    }
}

// Chargement de tous les utilisateurs créés
async function chargerUtilisateursAdmin() {
    const container = document.getElementById('admin-users-container');
    if (!container) return;
    container.innerHTML = "<p style='color:var(--text-muted);'>Lecture des comptes...</p>";

    try {
        const querySnapshot = await getDocs(collection(db, "utilisateurs"));
        container.innerHTML = "";
        querySnapshot.forEach((doc) => {
            const u = doc.data();
            const div = document.createElement('div');
            div.className = 'user-row';
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid var(--border)';
            div.innerHTML = `🎬 <strong>${u.email}</strong> - <span style="color:var(--primary); text-transform:uppercase; font-size:11px; font-weight:700;">${u.role || 'client'}</span>`;
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = "<p style='color:#ef4444;'>Impossible de charger la liste.</p>";
    }
}

// =================================================================
// 9. LOGIQUE DU MODE SOMBRE / CLAIR (THEME SWITCHER)
// =================================================================
const themeToggle = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
        localStorage.setItem('theme', 'light');
    } else {
        localStorage.setItem('theme', 'dark');
    }
});

// Lancement au premier démarrage
synchroniserPanier();