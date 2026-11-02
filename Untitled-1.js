
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    addDoc,
    getDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// ======================================
// 1. CONFIGURACIÓN DE FIREBASE
// ======================================

const firebaseConfig = {
    apiKey: "AIzaSyCZom-8s-In2a-5DdmSoWzI7id1IP5wFdc",
    authDomain: "jk-connet.firebaseapp.com",
    projectId: "jk-connet",
    storageBucket: "jk-connet.firebasestorage.app",
    messagingSenderId: "1058032857328",
    appId: "1:1058032857328:web:613d9750b90af273791235",
    measurementId: "G-YT6KLKDK01"
};

const appFirebase = initializeApp(firebaseConfig);
const auth = getAuth(appFirebase);
const db = getFirestore(appFirebase);

// ======================================
// 2. ELEMENTOS HTML
// ======================================

const authScreen = document.getElementById("authScreen");
const application = document.getElementById("app");

const authForm = document.getElementById("authForm");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const nameInput = document.getElementById("nameInput");
const nameLabel = document.getElementById("nameLabel");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const authButton = document.getElementById("authButton");
const authMessage = document.getElementById("authMessage");

const logoutButton = document.getElementById("logoutButton");

const postForm = document.getElementById("postForm");
const postText = document.getElementById("postText");
const postsContainer = document.getElementById("postsContainer");
const explorePosts = document.getElementById("explorePosts");
const myPosts = document.getElementById("myPosts");

const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const previewImg = document.getElementById("previewImg");
const removeImage = document.getElementById("removeImage");

const chatForm = document.getElementById("chatForm");
const chatMessages = document.getElementById("chatMessages");

// ======================================
// 3. VARIABLES
// ======================================

let authMode = "login";
let currentUser = null;
let selectedImage = null;
let unsubscribePosts = null;


let unsubscribeUsers = null;
let unsubscribeMessages = null;
let selectedContact = null;
let selectedChatId = null;
let contactsCache = [];


// ======================================
// 4. CAMBIAR ENTRE LOGIN Y REGISTRO
// ======================================

function setAuthMode(mode) {
    authMode = mode;

    const registering = mode === "register";

    loginTab.classList.toggle("active", !registering);
    registerTab.classList.toggle("active", registering);

    nameInput.classList.toggle("hidden", !registering);
    nameLabel.classList.toggle("hidden", !registering);

    nameInput.required = registering;

    authButton.textContent = registering
        ? "Crear cuenta"
        : "Iniciar sesión";

    authMessage.textContent = "";
    authMessage.className = "message";
}

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));

// ======================================
// 5. MENSAJES DE ERROR
// ======================================

function translateError(error) {
    const errors = {
        "auth/email-already-in-use":
            "Este correo ya tiene una cuenta registrada.",

        "auth/invalid-email":
            "El correo electrónico no es válido.",

        "auth/weak-password":
            "La contraseña debe tener al menos 6 caracteres.",

        "auth/user-not-found":
            "No existe una cuenta con ese correo.",

        "auth/wrong-password":
            "La contraseña es incorrecta.",

        "auth/invalid-credential":
            "Correo o contraseña incorrectos.",

        "auth/too-many-requests":
            "Demasiados intentos. Espera un momento.",

        "auth/network-request-failed":
            "Error de conexión. Revisa tu internet."
    };

    return errors[error.code] ||
        "Ocurrió un error. Inténtalo nuevamente.";
}

// ======================================
// 6. REGISTRO E INICIO DE SESIÓN
// ======================================

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();

    authButton.disabled = true;
    authButton.textContent = "Conectando...";

    authMessage.textContent = "";

    try {

        if (authMode === "register") {

            if (!name) {
                throw new Error("Escribe tu nombre completo.");
            }

            const credential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

            await updateProfile(credential.user, {
                displayName: name
            });

            await setDoc(
                doc(db, "users", credential.user.uid),
                {
                    uid: credential.user.uid,
                    name: name,
                    createdAt: serverTimestamp()
                }
            );

            authMessage.textContent =
                "¡Cuenta creada correctamente!";

        } else {

            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        }

    } catch (error) {

        authMessage.textContent =
            error.message.startsWith("Escribe")
                ? error.message
                : translateError(error);

        authMessage.className = "message error";

    } finally {

        authButton.disabled = false;

        authButton.textContent =
            authMode === "register"
                ? "Crear cuenta"
                : "Iniciar sesión";
    }
});


// ======================================
// 7. CONTROL DE SESIÓN
// ======================================

onAuthStateChanged(auth, async (user) => {

    if (user) {

        currentUser = user;

        authScreen.classList.add("hidden");
        application.classList.remove("hidden");

        await loadUserProfile(user);

        // Cargar publicaciones
        startPostsListener();

        // CARGAR CONTACTOS EN TIEMPO REAL
        startUsersListener();

    } else {

        currentUser = null;

        authScreen.classList.remove("hidden");
        application.classList.add("hidden");

        // Detener escucha de publicaciones
        if (unsubscribePosts) {
            unsubscribePosts();
            unsubscribePosts = null;
        }

        // Detener escucha de usuarios
        if (unsubscribeUsers) {
            unsubscribeUsers();
            unsubscribeUsers = null;
        }

        // Detener escucha de mensajes
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }

        selectedContact = null;
        selectedChatId = null;
        contactsCache = [];

    }

});


// ======================================
// 8. CARGAR PERFIL
// ======================================

async function loadUserProfile(user) {

    let name = user.displayName || "Usuario";

    try {

        const profileRef = doc(db, "users", user.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
            name = profileSnap.data().name || name;
        }

    } catch (error) {
        console.error("Error al cargar perfil:", error);
    }

    document.getElementById("sidebarName").textContent = name;
    document.getElementById("topName").textContent = name;
    document.getElementById("welcomeName").textContent = name;

    document.getElementById("profileName").textContent = name;
    document.getElementById("profileEmail").textContent = user.email || "";

    document.getElementById("sidebarAvatar").textContent =
        name.charAt(0).toUpperCase();

    document.getElementById("profileAvatar").textContent =
        name.charAt(0).toUpperCase();

}

// ======================================
// 9. CERRAR SESIÓN
// ======================================

logoutButton.addEventListener("click", async () => {

    try {
        await signOut(auth);
        setAuthMode("login");
        authForm.reset();

    } catch (error) {
        alert("No se pudo cerrar sesión.");
        console.error(error);
    }

});

// ======================================
// 10. NAVEGACIÓN
// ======================================

const navButtons = document.querySelectorAll(".nav-btn");

const pages = {
    home: document.getElementById("homePage"),
    explore: document.getElementById("explorePage"),
    messages: document.getElementById("messagesPage"),
    profile: document.getElementById("profilePage")
};

const pageTitles = {
    home: "Inicio",
    explore: "Explorar",
    messages: "Mensajes",
    profile: "Mi perfil"
};

navButtons.forEach(button => {

    button.addEventListener("click", () => {

        const page = button.dataset.page;

        navButtons.forEach(btn =>
            btn.classList.remove("active")
        );

        button.classList.add("active");

        Object.values(pages).forEach(section =>
            section.classList.add("hidden")
        );

        if (pages[page]) {
            pages[page].classList.remove("hidden");
        }

        document.getElementById("pageTitle").textContent =
            pageTitles[page] || "JK CONNECT";

    });

});

// ======================================
// 11. VISTA PREVIA DE FOTOGRAFÍAS
// ======================================

imageInput.addEventListener("change", () => {

    const file = imageInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Selecciona una imagen válida.");
        imageInput.value = "";
        return;
    }

    if (file.size > 3 * 1024 * 1024) {
        alert("La imagen no puede superar los 3 MB.");
        imageInput.value = "";
        return;
    }

    selectedImage = file;

    const reader = new FileReader();

    reader.onload = (event) => {
        previewImg.src = event.target.result;
        imagePreview.classList.remove("hidden");
    };

    reader.readAsDataURL(file);

});

removeImage.addEventListener("click", () => {

    selectedImage = null;
    imageInput.value = "";
    previewImg.src = "";

    imagePreview.classList.add("hidden");

});

// ======================================
// 12. CREAR PUBLICACIONES EN FIRESTORE
// ======================================

postForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    if (!currentUser) return;

    const text = postText.value.trim();

    if (!text && !selectedImage) {
        alert("Escribe algo para publicar.");
        return;
    }

    if (selectedImage) {
        alert(
            "La publicación de fotografías estará disponible " +
            "cuando configuremos Firebase Storage. " +
            "Por ahora puedes publicar texto."
        );
        return;
    }

    const publishButton =
        postForm.querySelector('button[type="submit"]');

    publishButton.disabled = true;

    try {

        const profileSnap = await getDoc(
            doc(db, "users", currentUser.uid)
        );

        const name = profileSnap.exists()
            ? profileSnap.data().name
            : currentUser.displayName || "Usuario";

        await addDoc(collection(db, "posts"), {

            uid: currentUser.uid,
            name: name,
            text: text,
            createdAt: serverTimestamp()

        });

        postText.value = "";

    } catch (error) {

        console.error("Error publicando:", error);
        alert("No se pudo publicar. Revisa las reglas de Firestore.");

    } finally {

        publishButton.disabled = false;

    }

});

// ======================================
// 13. ESCUCHAR PUBLICACIONES EN TIEMPO REAL
// ======================================

function startPostsListener() {

    if (unsubscribePosts) {
        unsubscribePosts();
    }

    const postsQuery = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc")
    );

    unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {

        postsContainer.innerHTML = "";
        explorePosts.innerHTML = "";
        myPosts.innerHTML = "";

        if (snapshot.empty) {

            postsContainer.innerHTML =
                '<p class="chat-empty">Todavía no hay publicaciones. ¡Sé el primero!</p>';

            explorePosts.innerHTML =
                '<p class="chat-empty">Aún no hay publicaciones.</p>';

            myPosts.innerHTML =
                '<p class="chat-empty">Todavía no tienes publicaciones.</p>';

            return;
        }

        snapshot.forEach(documentSnapshot => {

            const post = {
                id: documentSnapshot.id,
                ...documentSnapshot.data()
            };

            const card = createPostCard(post);

            postsContainer.appendChild(card);

            explorePosts.appendChild(
                createPostCard(post)
            );

            if (currentUser && post.uid === currentUser.uid) {
                myPosts.appendChild(
                    createPostCard(post)
                );
            }

        });

        if (currentUser && myPosts.children.length === 0) {
            myPosts.innerHTML =
                '<p class="chat-empty">Todavía no tienes publicaciones.</p>';
        }

    }, (error) => {

        console.error("Error escuchando publicaciones:", error);

        postsContainer.innerHTML =
            '<p class="chat-empty">No se pudieron cargar las publicaciones.</p>';

    });

}

// ======================================
// 14. DISEÑAR TARJETA DE PUBLICACIÓN
// ======================================

function createPostCard(post) {

    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("div");
    header.className = "post-header";

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    avatar.textContent =
        (post.name || "U").charAt(0).toUpperCase();

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = post.name || "Usuario";

    const date = document.createElement("small");

    if (post.createdAt?.toDate) {
        date.textContent =
            post.createdAt.toDate().toLocaleString("es-PE");
    } else {
        date.textContent = "Publicación reciente";
    }

    info.appendChild(name);
    info.appendChild(date);

    header.appendChild(avatar);
    header.appendChild(info);

    const content = document.createElement("p");
    content.className = "post-content";
    content.textContent = post.text || "";

    card.appendChild(header);
    card.appendChild(content);

    if (currentUser && post.uid === currentUser.uid) {

        const actions = document.createElement("div");
        actions.className = "post-actions";

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "upload-btn";
        deleteButton.textContent = "Eliminar publicación";

        deleteButton.addEventListener("click", async () => {

            if (!confirm("¿Quieres eliminar esta publicación?")) {
                return;
            }

            try {

                await deleteDoc(
                    doc(db, "posts", post.id)
                );

            } catch (error) {

                console.error(error);
                alert("No se pudo eliminar la publicación.");

            }

        });

        actions.appendChild(deleteButton);
        card.appendChild(actions);

    }

    return card;

}

// ==========================================
// 15. USUARIOS Y CONTACTOS EN TIEMPO REAL
// ==========================================

const contactsList = document.getElementById("contactsList");
const userSearch = document.getElementById("userSearch");
const chatContactName = document.getElementById("chatContactName");
const chatContactStatus = document.getElementById("chatContactStatus");
const chatAvatar = document.getElementById("chatAvatar");
const messageInput = document.getElementById("messageInput");
const sendMessageButton = document.getElementById("sendMessageButton");

function startUsersListener() {

    if (unsubscribeUsers) unsubscribeUsers();

    unsubscribeUsers = onSnapshot(
        collection(db, "users"),
        (snapshot) => {

            contactsCache = [];

            snapshot.forEach(userDoc => {

                const person = userDoc.data();

                if (userDoc.id !== currentUser.uid) {

                    contactsCache.push({
                        uid: userDoc.id,
                        name: person.name || "Usuario"
                    });

                }

            });

            renderContacts();

        },
        error => {
            console.error("Error cargando contactos:", error);
            contactsList.textContent = "No se pudieron cargar los usuarios.";
        }
    );

}

// ==========================================
// 16. BUSCADOR DE CONTACTOS
// ==========================================

function renderContacts() {

    const search = userSearch.value.trim().toLowerCase();

    contactsList.innerHTML = "";

    const filteredUsers = contactsCache.filter(person =>
        person.name.toLowerCase().includes(search)
    );

    if (filteredUsers.length === 0) {

        const empty = document.createElement("p");
        empty.className = "chat-empty";
        empty.textContent = "No se encontraron usuarios.";

        contactsList.appendChild(empty);
        return;

    }

    filteredUsers.forEach(person => {

        const contact = document.createElement("button");
        contact.type = "button";
        contact.className = "contact";

        if (selectedContact?.uid === person.uid) {
            contact.classList.add("active");
        }

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = person.name.charAt(0).toUpperCase();

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = person.name;

        const status = document.createElement("small");
        status.textContent = "Usuario de JK CONNECT";

        info.appendChild(name);
        info.appendChild(status);

        contact.appendChild(avatar);
        contact.appendChild(info);

        contact.addEventListener("click", () => {
            openPrivateChat(person);
        });

        contactsList.appendChild(contact);

    });

}

userSearch.addEventListener("input", renderContacts);

// ==========================================
// 17. ABRIR CONVERSACIÓN PRIVADA
// ==========================================

async function openPrivateChat(person) {

    if (!currentUser) return;

    selectedContact = person;

    const participants = [
        currentUser.uid,
        person.uid
    ].sort();

    // El mismo identificador para ambos participantes
    selectedChatId = participants.join("_");

    chatContactName.textContent = person.name;
    chatContactStatus.textContent = "Conversación privada";
    chatAvatar.textContent =
        person.name.charAt(0).toUpperCase();

    messageInput.disabled = false;
    sendMessageButton.disabled = false;

    messageInput.focus();

    renderContacts();

    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }

    chatMessages.innerHTML = `
        <div class="chat-empty">
            <p>Conectando con ${escapeHTML(person.name)}...</p>
        </div>
    `;

    try {

        const chatRef = doc(db, "chats", selectedChatId);
        const chatSnapshot = await getDoc(chatRef);

        if (!chatSnapshot.exists()) {

            await setDoc(chatRef, {
                participants: participants,
                createdAt: serverTimestamp()
            });

        }

        // Evitar escuchar una conversación que ya no está seleccionada
        if (selectedContact?.uid !== person.uid) return;

        listenToMessages();

    } catch (error) {

        console.error("Error abriendo conversación:", error);

        chatMessages.textContent =
            "No se pudo abrir la conversación. Revisa las reglas de Firebase.";

    }

}

// ==========================================
// 18. ESCUCHAR MENSAJES EN TIEMPO REAL
// ==========================================

function listenToMessages() {

    if (!selectedChatId) return;

    const messagesQuery = query(
        collection(
            db,
            "chats",
            selectedChatId,
            "messages"
        ),
        orderBy("createdAt", "asc")
    );

    unsubscribeMessages = onSnapshot(
        messagesQuery,
        snapshot => {

            chatMessages.innerHTML = "";

            if (snapshot.empty) {

                const empty = document.createElement("div");
                empty.className = "chat-empty";
                empty.innerHTML = `
                    <span>✦</span>
                    <p>¡Empieza la conversación!</p>
                    <small>Envía el primer mensaje.</small>
                `;

                chatMessages.appendChild(empty);
                return;

            }

            snapshot.forEach(messageDoc => {

                const message = messageDoc.data();

                const bubble = document.createElement("div");

                bubble.className =
                    message.senderId === currentUser.uid
                        ? "chat-bubble mine"
                        : "chat-bubble theirs";

                const text = document.createElement("p");
                text.textContent = message.text;

                bubble.appendChild(text);

                const time = document.createElement("small");

                if (message.createdAt?.toDate) {
                    time.textContent =
                        message.createdAt.toDate().toLocaleTimeString(
                            "es-PE",
                            { hour: "2-digit", minute: "2-digit" }
                        );
                } else {
                    time.textContent = "Enviando...";
                }

                bubble.appendChild(time);
                chatMessages.appendChild(bubble);

            });

            chatMessages.scrollTop = chatMessages.scrollHeight;

        },
        error => {

            console.error("Error escuchando mensajes:", error);

            chatMessages.textContent =
                "No se pudieron cargar los mensajes.";

        }
    );

}

// ==========================================
// 19. ENVIAR MENSAJES PRIVADOS
// ==========================================

chatForm.addEventListener("submit", async event => {

    event.preventDefault();

    if (!currentUser || !selectedChatId || !selectedContact) {
        return;
    }

    const text = messageInput.value.trim();

    if (!text) return;

    const chatId = selectedChatId;
    const recipientId = selectedContact.uid;

    sendMessageButton.disabled = true;

    try {

        await addDoc(
            collection(db, "chats", chatId, "messages"),
            {
                senderId: currentUser.uid,
                receiverId: recipientId,
                text: text,
                createdAt: serverTimestamp()
            }
        );

        messageInput.value = "";
        messageInput.focus();

    } catch (error) {

        console.error("Error enviando mensaje:", error);

        alert(
            "No se pudo enviar el mensaje. Comprueba las reglas de Firestore."
        );

    } finally {

        sendMessageButton.disabled = false;

    }

});

// ==========================================
// 20. SEGURIDAD AL MOSTRAR TEXTO
// ==========================================

function escapeHTML(text) {

    return String(text).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);

}

console.log("JK CONNECT: sistema de chat privado preparado.");
