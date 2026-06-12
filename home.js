// ============================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ SLICEMES
// ============================================

let currentUser = null;
let currentChat = null;
let messageUnsubscribe = null;

// API ключ FreeImage.host (твой ключ)
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.opacity = '1';
        }, 300);
    }, 3000);
}

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db) {
                clearInterval(checkInterval);
                console.log('Firebase готов');
                resolve();
            }
        }, 100);
    });
}

// ========== ФУНКЦИИ ЗАГРУЗКИ МЕДИА ==========

async function uploadToFreeImage(file) {
    const formData = new FormData();
    formData.append('source', file);
    formData.append('key', FREEIMAGE_API_KEY);
    
    try {
        const response = await fetch('https://freeimage.host/api/1/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (result.status_code === 200) {
            return {
                url: result.image.url,
                thumb: result.image.thumb?.url || result.image.url
            };
        } else {
            throw new Error(result.error?.message || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        return null;
    }
}

function getFileType(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'unknown';
}

function setupMediaPreview() {
    const fileInput = document.getElementById('postMediaFile');
    const preview = document.getElementById('mediaPreview');
    if (!fileInput) return;
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            preview.innerHTML = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${event.target.result}" style="max-width:100%; max-height:150px; border-radius:8px;">`;
            } else if (file.type.startsWith('video/')) {
                preview.innerHTML = `<video src="${event.target.result}" controls style="max-width:100%; max-height:150px; border-radius:8px;"></video>`;
            }
        };
        reader.readAsDataURL(file);
    });
}

// ========== ЗАГРУЗКА ДРУЗЕЙ (ТОЛЬКО ДРУЗЬЯ) ==========

async function loadFriends() {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    if (!users) return;
    
    let currentUserData = null;
    let currentUserKey = null;
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUserData = users[key];
            currentUserKey = key;
            break;
        }
    }
    
    if (!currentUserData) return;
    
    const friendsIds = currentUserData.friends || [];
    
    const friendsList = [];
    for (let friendId of friendsIds) {
        for (let key in users) {
            if (users[key].uniqueId === friendId) {
                friendsList.push({
                    id: key,
                    name: users[key].name,
                    email: users[key].email,
                    uniqueId: users[key].uniqueId,
                    avatar: users[key].avatar
                });
                break;
            }
        }
    }
    
    renderFriends(friendsList);
    renderChats(friendsList);
}

function renderFriends(friends) {
    const container = document.getElementById('friendsGrid');
    if (!friends.length) {
        container.innerHTML = '<div class="empty-state">У вас пока нет друзей<br><br>👉 Нажмите "➕ Добавить друга" чтобы найти друзей по ID</div>';
        return;
    }
    
    container.innerHTML = friends.map(friend => `
        <div class="friend-card" data-id="${friend.uniqueId}">
            <div class="friend-avatar">${friend.avatar ? `<img src="${friend.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
            <div class="friend-info">
                <div class="friend-name">${escapeHtml(friend.name)}</div>
                <div class="friend-id">${friend.uniqueId}</div>
            </div>
            <div class="friend-actions">
                <button class="friend-msg-btn" data-id="${friend.uniqueId}" data-name="${escapeHtml(friend.name)}">💬</button>
                <button class="friend-remove-btn" data-id="${friend.uniqueId}">✕</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.friend-msg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            openChat(friendId, friendName);
            document.querySelector('.nav-item[data-page="chats"]').click();
        });
    });
    
    document.querySelectorAll('.friend-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const friendId = btn.dataset.id;
            if (confirm('Удалить друга?')) {
                await removeFriend(friendId);
            }
        });
    });
}
function renderChats(friends) {
    if (isMobile) {
        renderChatsMobile(friends);
    } else {
        const container = document.getElementById('chatsList');
        if (!friends.length) {
            container.innerHTML = '<div class="empty-state">Нет чатов<br><br>👉 Добавьте друзей чтобы начать общение</div>';
            return;
        }
        
        container.innerHTML = friends.map(friend => `
            <div class="chat-item" data-id="${friend.uniqueId}" data-name="${escapeHtml(friend.name)}">
                <div class="chat-item-avatar">${friend.avatar ? `<img src="${friend.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
                <div class="chat-item-info">
                    <div class="chat-item-name">${escapeHtml(friend.name)}</div>
                    <div class="chat-item-lastmsg">Нажмите для чата</div>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const friendId = item.dataset.id;
                const friendName = item.dataset.name;
                openChat(friendId, friendName);
            });
        });
    }
}

async function removeFriend(friendId) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let currentUserKey = null;
    let friendUserKey = null;
    
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUserKey = key;
        }
        if (users[key].uniqueId === friendId) {
            friendUserKey = key;
        }
    }
    
    if (currentUserKey && friendUserKey) {
        let currentFriends = users[currentUserKey].friends || [];
        currentFriends = currentFriends.filter(id => id !== friendId);
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUserKey), { friends: currentFriends });
        
        let friendFriends = users[friendUserKey].friends || [];
        friendFriends = friendFriends.filter(id => id !== currentUser.uniqueId);
        await firebaseUpdate(firebaseRef(db, 'users/' + friendUserKey), { friends: friendFriends });
        
        showToast('Друг удален');
        await loadFriends();
        await loadChats();
        
        if (currentChat && currentChat.id === friendId) {
            document.getElementById('chatMessagesArea').innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Чат закрыт</p></div>';
            document.getElementById('chatAreaHeader').style.display = 'none';
            document.getElementById('chatInputArea').style.display = 'none';
            currentChat = null;
            if (messageUnsubscribe) {
                messageUnsubscribe();
                messageUnsubscribe = null;
            }
        }
    }
}

// ========== ПОИСК И ДОБАВЛЕНИЕ ДРУГА ==========

async function searchAndAddFriend() {
    const friendId = document.getElementById('friendIdInput').value.trim().toUpperCase();
    if (!friendId) {
        showToast('Введите ID друга', true);
        return;
    }
    
    if (friendId === currentUser.uniqueId) {
        showToast('Нельзя добавить самого себя', true);
        return;
    }
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let foundUser = null;
    let foundUserKey = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            foundUser = { ...users[key], id: key };
            foundUserKey = key;
            break;
        }
    }
    
    if (!foundUser) {
        showToast('Пользователь не найден', true);
        return;
    }
    
    let currentUserKey = null;
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUserKey = key;
            break;
        }
    }
    
    const currentFriends = users[currentUserKey].friends || [];
    if (currentFriends.includes(friendId)) {
        showToast('Этот пользователь уже в друзьях', true);
        return;
    }
    
    const resultDiv = document.getElementById('searchResultModal');
    resultDiv.innerHTML = `
        <div class="found-user">
            <div>
                <div style="font-weight:600;">${escapeHtml(foundUser.name)}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);">${foundUser.email}</div>
            </div>
            <button class="add-friend-btn" id="confirmAddFriendBtn">Добавить</button>
        </div>
    `;
    
    document.getElementById('confirmAddFriendBtn').onclick = async () => {
        let updatedFriends = currentFriends;
        updatedFriends.push(friendId);
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUserKey), { friends: updatedFriends });
        
        let friendFriends = users[foundUserKey].friends || [];
        if (!friendFriends.includes(currentUser.uniqueId)) {
            friendFriends.push(currentUser.uniqueId);
            await firebaseUpdate(firebaseRef(db, 'users/' + foundUserKey), { friends: friendFriends });
        }
        
        showToast(`✅ ${foundUser.name} добавлен в друзья!`);
        document.getElementById('addFriendModal').classList.remove('show');
        document.getElementById('friendIdInput').value = '';
        resultDiv.innerHTML = '';
        await loadFriends();
        await loadChats();
    };
}

// ========== ЧАТЫ И СООБЩЕНИЯ ==========

async function openChat(friendId, friendName) {
    if (messageUnsubscribe) {
        messageUnsubscribe();
    }
    
    currentChat = { id: friendId, name: friendName };
    
    document.getElementById('chatAreaHeader').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'flex';
    document.getElementById('chatContactName').textContent = friendName;
    document.getElementById('deleteChatBtn').style.display = 'block';
    
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    
    messageUnsubscribe = firebaseOnValue(messagesRef, (snapshot) => {
        const messages = snapshot.val();
        renderMessages(messages ? Object.values(messages).sort((a,b) => a.id - b.id) : []);
    });
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessagesArea');
    
    if (!messages.length) {
        container.innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Начните общение!</p></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isSent = msg.from === currentUser.uniqueId;
        const time = new Date(msg.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-avatar">${isSent ? '👤' : '👥'}</div>
                <div>
                    <div class="message-content">${escapeHtml(msg.text)}</div>
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChat) return;
    
    const chatId = [currentUser.uniqueId, currentChat.id].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    const newMsgRef = firebasePush(messagesRef);
    
    await firebaseSet(newMsgRef, {
        id: Date.now(),
        from: currentUser.uniqueId,
        to: currentChat.id,
        text: text,
        time: new Date().toISOString(),
        read: false
    });
    
    input.value = '';
}

async function deleteChat() {
    if (!currentChat) return;
    if (confirm('Удалить всю переписку?')) {
        const chatId = [currentUser.uniqueId, currentChat.id].sort().join('___');
        await firebaseRemove(firebaseRef(db, 'messages/' + chatId));
        showToast('Чат удален');
        document.getElementById('chatMessagesArea').innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Чат удален</p></div>';
        document.getElementById('chatAreaHeader').style.display = 'none';
        document.getElementById('chatInputArea').style.display = 'none';
        currentChat = null;
        if (messageUnsubscribe) {
            messageUnsubscribe();
            messageUnsubscribe = null;
        }
    }
}

// ========== ПРОФИЛЬ ==========
async function loadCurrentUser() {
    const saved = localStorage.getItem('currentUser');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(saved);
    console.log('Пользователь:', currentUser.name);
    
    // Загружаем актуальные данные из Firebase
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUser.id = key;
            currentUser.friends = users[key].friends || [];
            currentUser.avatar = users[key].avatar;
            currentUser.bio = users[key].bio || '';
            currentUser.cover = users[key].cover;
            break;
        }
    }
}


function updateUserUI() {
    const userNameEl = document.getElementById('sidebarUserName');
    const userIdEl = document.getElementById('sidebarUserUniqueId');
    const profileNameEl = document.getElementById('profileNameInput');
    const profileEmailEl = document.getElementById('profileEmailInput');
    const profileIdEl = document.getElementById('profileIdInput');
    const profileBioEl = document.getElementById('profileBioInput');
    
    if (userNameEl) userNameEl.textContent = currentUser.name || currentUser.email;
    if (userIdEl) userIdEl.textContent = currentUser.uniqueId || 'ID...';
    if (profileNameEl) profileNameEl.value = currentUser.name || '';
    if (profileEmailEl) profileEmailEl.value = currentUser.email || '';
    if (profileIdEl) profileIdEl.value = currentUser.uniqueId || '';
    if (profileBioEl) profileBioEl.value = currentUser.bio || '';
    
    // Аватар в сайдбаре
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar && currentUser.avatar) {
        sidebarAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }
    
    // Аватар в профиле
    const profileAvatar = document.getElementById('profileAvatarLarge');
    if (profileAvatar && currentUser.avatar) {
        profileAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    }
    
    // Обложка профиля
    const profileCover = document.getElementById('profileCover');
    if (profileCover && currentUser.cover) {
        profileCover.style.backgroundImage = `url(${currentUser.cover})`;
        profileCover.style.backgroundSize = 'cover';
        profileCover.style.backgroundPosition = 'center';
    }
}

async function saveProfile() {
    const newName = document.getElementById('profileNameInput').value.trim();
    const newBio = document.getElementById('profileBioInput').value.trim();
    
    if (!newName) {
        showToast('Имя не может быть пустым', true);
        return;
    }
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            await firebaseUpdate(firebaseRef(db, 'users/' + key), { 
                name: newName,
                bio: newBio || ''
            });
            break;
        }
    }
    
    currentUser.name = newName;
    currentUser.bio = newBio;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateUserUI();
    showToast('Профиль обновлен');
    document.getElementById('profileModal').classList.remove('show');
}

async function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const avatarData = event.target.result;
            const usersRef = firebaseRef(db, 'users');
            const snapshot = await firebaseGet(usersRef);
            const users = snapshot.val();
            
            for (let key in users) {
                if (users[key].email === currentUser.email) {
                    await firebaseUpdate(firebaseRef(db, 'users/' + key), { avatar: avatarData });
                    break;
                }
            }
            
            currentUser.avatar = avatarData;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUserUI();
            showToast('Аватар обновлен');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function changeCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const coverData = event.target.result;
            const usersRef = firebaseRef(db, 'users');
            const snapshot = await firebaseGet(usersRef);
            const users = snapshot.val();
            
            for (let key in users) {
                if (users[key].email === currentUser.email) {
                    await firebaseUpdate(firebaseRef(db, 'users/' + key), { cover: coverData });
                    break;
                }
            }
            
            document.getElementById('profileCover').style.backgroundImage = `url(${coverData})`;
            showToast('Обложка обновлена');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ========== ЛЕНТА С ПОСТАМИ ==========

async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    const mediaFile = document.getElementById('postMediaFile').files[0];
    
    if (!content && !mediaFile) {
        showToast('Введите текст или прикрепите фото/видео', true);
        return;
    }
    
    showToast('Публикация...');
    
    let mediaUrl = null;
    let mediaType = null;
    
    if (mediaFile) {
        const uploaded = await uploadToFreeImage(mediaFile);
        if (uploaded) {
            mediaUrl = uploaded.url;
            mediaType = getFileType(mediaFile);
        } else {
            showToast('Ошибка загрузки медиа', true);
            return;
        }
    }
    
    const postsRef = firebaseRef(db, 'posts');
    const newPostRef = firebasePush(postsRef);
    
    await firebaseSet(newPostRef, {
        id: Date.now(),
        authorId: currentUser.uniqueId,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar || null,
        content: content,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        time: new Date().toISOString(),
        likes: 0,
        comments: []
    });
    
    showToast('✅ Пост опубликован!');
    document.getElementById('createPostModal').classList.remove('show');
    document.getElementById('postContent').value = '';
    document.getElementById('postMediaFile').value = '';
    document.getElementById('mediaPreview').innerHTML = '';
    await loadFeed();
}

async function loadFeed() {
    const postsRef = firebaseRef(db, 'posts');
    const snapshot = await firebaseGet(postsRef);
    const posts = snapshot.val();
    
    const container = document.getElementById('feedPosts');
    if (!posts) {
        container.innerHTML = '<div class="empty-state">Нет постов</div>';
        return;
    }
    
    const postsArray = Object.values(posts).sort((a,b) => b.id - a.id);
    container.innerHTML = postsArray.map(post => `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${post.authorAvatar ? `<img src="${post.authorAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
                <div>
                    <div class="post-author">${escapeHtml(post.authorName)}</div>
                    <div class="post-time">${new Date(post.time).toLocaleString()}</div>
                </div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            ${post.mediaUrl ? `
                <div class="post-media">
                    ${post.mediaType === 'image' ? 
                        `<img src="${post.mediaUrl}" class="post-image" onclick="window.open(this.src)" style="max-width:100%; border-radius:12px; margin-top:10px; cursor:pointer">` : 
                        `<video src="${post.mediaUrl}" controls style="max-width:100%; border-radius:12px; margin-top:10px"></video>`
                    }
                </div>
            ` : ''}
            <div class="post-actions">
                <button class="post-like-btn" data-id="${post.id}">❤️ ${post.likes || 0}</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.post-like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.dataset.id;
            await likePost(postId);
        });
    });
}

async function likePost(postId) {
    const postsRef = firebaseRef(db, 'posts');
    const snapshot = await firebaseGet(postsRef);
    const posts = snapshot.val();
    
    for (let key in posts) {
        if (posts[key].id == postId) {
            const currentLikes = posts[key].likes || 0;
            await firebaseUpdate(firebaseRef(db, 'posts/' + key), { likes: currentLikes + 1 });
            showToast('❤️ Лайк поставлен!');
            await loadFeed();
            break;
        }
    }
}

// ========== ИГРА ЗМЕЙКА ==========

let snakeInterval = null;
let snakeDirection = 'RIGHT';
let snakeBody = [];
let snakeFood = {};
let snakeScore = 0;

function initSnakeGame() {
    const canvas = document.getElementById('snakeCanvas');
    if (!canvas) return;
    
    if (snakeInterval) clearInterval(snakeInterval);
    
    snakeBody = [{x: 200, y: 200}];
    snakeDirection = 'RIGHT';
    snakeScore = 0;
    document.getElementById('snakeScore').textContent = '0';
    
    snakeFood = {
        x: Math.floor(Math.random() * 20) * 20,
        y: Math.floor(Math.random() * 20) * 20
    };
    
    function draw() {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, 400, 400);
        
        ctx.fillStyle = '#00ff88';
        snakeBody.forEach(segment => {
            ctx.fillRect(segment.x, segment.y, 18, 18);
        });
        
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(snakeFood.x, snakeFood.y, 18, 18);
    }
    
    function move() {
        let newHead = {...snakeBody[0]};
        switch(snakeDirection) {
            case 'RIGHT': newHead.x += 20; break;
            case 'LEFT': newHead.x -= 20; break;
            case 'UP': newHead.y -= 20; break;
            case 'DOWN': newHead.y += 20; break;
        }
        
        if (newHead.x === snakeFood.x && newHead.y === snakeFood.y) {
            snakeScore++;
            document.getElementById('snakeScore').textContent = snakeScore;
            snakeBody.unshift(newHead);
            snakeFood = {
                x: Math.floor(Math.random() * 20) * 20,
                y: Math.floor(Math.random() * 20) * 20
            };
        } else {
            snakeBody.unshift(newHead);
            snakeBody.pop();
        }
        
        if (newHead.x < 0 || newHead.x >= 400 || newHead.y < 0 || newHead.y >= 400) {
            clearInterval(snakeInterval);
            alert(`Игра окончена! Счет: ${snakeScore}`);
            snakeInterval = null;
        }
        
        draw();
    }
    
    function handleSnakeKey(e) {
        if (e.key === 'ArrowRight' && snakeDirection !== 'LEFT') snakeDirection = 'RIGHT';
        if (e.key === 'ArrowLeft' && snakeDirection !== 'RIGHT') snakeDirection = 'LEFT';
        if (e.key === 'ArrowUp' && snakeDirection !== 'DOWN') snakeDirection = 'UP';
        if (e.key === 'ArrowDown' && snakeDirection !== 'UP') snakeDirection = 'DOWN';
    }
    
    document.removeEventListener('keydown', handleSnakeKey);
    document.addEventListener('keydown', handleSnakeKey);
    
    snakeInterval = setInterval(move, 150);
    draw();
}

// ========== НАВИГАЦИЯ И СОБЫТИЯ ==========

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(`${pageName}Page`).classList.add('active');
            
            if (pageName === 'feed') {
                loadFeed();
            }
        });
    });
}
// Поиск по друзьям
function setupFriendSearch() {
    const friendsSearch = document.getElementById('friendsSearch');
    if (!friendsSearch) return;
    
    friendsSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const friendCards = document.querySelectorAll('.friend-card');
        
        friendCards.forEach(card => {
            const name = card.querySelector('.friend-name')?.textContent.toLowerCase() || '';
            if (name.includes(query)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Поиск по чатам
function setupChatSearch() {
    const chatsSearch = document.getElementById('chatsSearch');
    if (!chatsSearch) return;
    
    chatsSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const chatItems = document.querySelectorAll('.chat-item');
        
        chatItems.forEach(item => {
            const name = item.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
            if (name.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });
}
function setupEventListeners() {
    // Выход
    document.getElementById('logoutBtnSidebar').onclick = () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };
    
    // Профиль
    document.getElementById('openProfileBtn').onclick = () => {
        document.getElementById('profileModal').classList.add('show');
    };
    document.getElementById('closeProfileModal').onclick = () => {
        document.getElementById('profileModal').classList.remove('show');
    };
    document.getElementById('saveProfileChangesBtn').onclick = saveProfile;
    document.getElementById('changeAvatarBtn').onclick = changeAvatar;
    document.getElementById('changeCoverBtn').onclick = changeCover;
    
    // Добавление друга
    document.getElementById('addFriendHeaderBtn').onclick = () => {
        document.getElementById('addFriendModal').classList.add('show');
    };
    document.getElementById('closeAddFriendModal').onclick = () => {
        document.getElementById('addFriendModal').classList.remove('show');
        document.getElementById('friendIdInput').value = '';
        document.getElementById('searchResultModal').innerHTML = '';
    };
    document.getElementById('searchFriendBtnModal').onclick = searchAndAddFriend;
    
    // Сообщения
    document.getElementById('sendMessageBtn').onclick = sendMessage;
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('deleteChatBtn').onclick = deleteChat;
    
    // Посты
    document.getElementById('createPostBtn').onclick = () => {
        document.getElementById('createPostModal').classList.add('show');
    };
    document.getElementById('closePostModal').onclick = () => {
        document.getElementById('createPostModal').classList.remove('show');
        document.getElementById('postContent').value = '';
        document.getElementById('postMediaFile').value = '';
        document.getElementById('mediaPreview').innerHTML = '';
    };
    document.getElementById('publishPostBtn').onclick = createPost;
    
    // Игры
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
            const game = card.dataset.game;
            if (game === 'snake') {
                document.getElementById('snakeGameModal').classList.add('show');
                setTimeout(initSnakeGame, 100);
            } else {
                showToast('Игра в разработке');
            }
        });
    });
    document.getElementById('closeGameModal').onclick = () => {
        document.getElementById('snakeGameModal').classList.remove('show');
        if (snakeInterval) {
            clearInterval(snakeInterval);
            snakeInterval = null;
        }
    };
    document.getElementById('restartSnakeBtn').onclick = () => {
        initSnakeGame();
    };
    
    // Закрытие модалок по клику на фон
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('show');
        };
    });
    
    // Предпросмотр медиа (ТОЛЬКО ОДИН РАЗ)
    setupMediaPreview();
    
    // ===== ПОИСК ПО ДРУЗЬЯМ =====
    const friendsSearch = document.getElementById('friendsSearch');
    if (friendsSearch) {
        friendsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.friend-card').forEach(card => {
                const name = card.querySelector('.friend-name')?.textContent.toLowerCase() || '';
                card.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }
    
    // ===== ПОИСК ПО ЧАТАМ =====
    const chatsSearch = document.getElementById('chatsSearch');
    if (chatsSearch) {
        chatsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.chat-item').forEach(item => {
                const name = item.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
                item.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    console.log('Инициализация...');
    await waitForFirebase();
    await loadCurrentUser();
    setupNavigation();
    setupEventListeners();
    await loadFriends();
    await loadChats();
    await loadFeed();
    updateUserUI();
    console.log('Готово!');
}
// ========== МОБИЛЬНАЯ НАВИГАЦИЯ ==========

let isMobile = window.innerWidth <= 768;

function checkMobile() {
    isMobile = window.innerWidth <= 768;
    return isMobile;
}

// Открыть чат на мобильном (полноэкранный режим)
function openChatMobile(friendId, friendName) {
    if (!isMobile) {
        // Если десктоп - обычное поведение
        openChat(friendId, friendName);
        return;
    }
    
    // Мобильное поведение
    if (messageUnsubscribe) {
        messageUnsubscribe();
    }
    
    currentChat = { id: friendId, name: friendName };
    
    // Скрываем список чатов, показываем область чата
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'none';
    if (chatArea) {
        chatArea.classList.add('active');
        chatArea.style.display = 'flex';
    }
    
    // Добавляем кнопку назад в шапку чата, если её нет
    const chatHeader = document.querySelector('.chat-area-header');
    if (chatHeader && !chatHeader.querySelector('.back-button')) {
        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Назад';
        backBtn.onclick = closeChatMobile;
        chatHeader.insertBefore(backBtn, chatHeader.firstChild);
    }
    
    document.getElementById('chatContactName').textContent = friendName;
    document.getElementById('chatAreaHeader').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'flex';
    document.getElementById('deleteChatBtn').style.display = 'block';
    
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    
    messageUnsubscribe = firebaseOnValue(messagesRef, (snapshot) => {
        const messages = snapshot.val();
        renderMessages(messages ? Object.values(messages).sort((a,b) => a.id - b.id) : []);
    });
}

// Закрыть чат на мобильном (вернуться к списку чатов)
function closeChatMobile() {
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'flex';
    if (chatArea) {
        chatArea.classList.remove('active');
        chatArea.style.display = 'none';
    }
    
    // Отписываемся от сообщений
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
    
    currentChat = null;
}

// Переопределяем openChat для мобильных
function handleChatClick(friendId, friendName) {
    if (isMobile) {
        openChatMobile(friendId, friendName);
    } else {
        openChat(friendId, friendName);
    }
}

// Обновляем рендер чатов для мобильных
function renderChatsMobile(friends) {
    const container = document.getElementById('chatsList');
    if (!friends.length) {
        container.innerHTML = '<div class="empty-state">Нет чатов<br><br>👉 Добавьте друзей чтобы начать общение</div>';
        return;
    }
    
    container.innerHTML = friends.map(friend => `
        <div class="chat-item" data-id="${friend.uniqueId}" data-name="${escapeHtml(friend.name)}">
            <div class="chat-item-avatar">${friend.avatar ? `<img src="${friend.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${escapeHtml(friend.name)}</div>
                <div class="chat-item-lastmsg">Нажмите для чата</div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', () => {
            const friendId = item.dataset.id;
            const friendName = item.dataset.name;
            handleChatClick(friendId, friendName);
        });
    });
}

// Следим за изменением размера окна (поворот телефона)
window.addEventListener('resize', () => {
    isMobile = window.innerWidth <= 768;
    if (!isMobile) {
        // Если перешли на десктопный вид - закрываем мобильный чат
        closeChatMobile();
        const chatsSidebar = document.querySelector('.chats-sidebar');
        if (chatsSidebar) chatsSidebar.style.display = 'flex';
    }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    console.log('Инициализация...');
    await waitForFirebase();
    await loadCurrentUser();
    setupNavigation();
    setupEventListeners();
    await loadFriends();
    await loadChats();
    await loadFeed();
    updateUserUI();
    checkMobile(); // Проверяем тип устройства
    console.log('Готово!');
}

// ЗАПУСК
init();