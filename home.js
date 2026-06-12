// ============================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ SLICEMES
// ============================================

let currentUser = null;
let currentChat = null;
let messageUnsubscribe = null;

// API ключ FreeImage.host
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

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'никогда';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds} сек назад`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
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

// ========== ПРОФИЛЬ (С ИЗМЕНЕНИЕМ ID) ==========

async function loadCurrentUser() {
    const saved = localStorage.getItem('currentUser');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(saved);
    console.log('Пользователь:', currentUser.name);
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            // ===== ПРОВЕРКА НА БЛОКИРОВКУ =====
            if (users[key].isBanned && users[key].banExpires > Date.now()) {
                localStorage.removeItem('currentUser');
                alert('❌ Ваш аккаунт заблокирован!');
                window.location.href = 'index.html';
                return;
            }
            
            currentUser.id = key;
            currentUser.friends = users[key].friends || [];
            currentUser.avatar = users[key].avatar;
            currentUser.bio = users[key].bio || '';
            currentUser.cover = users[key].cover;
            currentUser.lastIdChange = users[key].lastIdChange || 0;
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
    const lastIdChangeEl = document.getElementById('lastIdChange');
    const idChangeWarningEl = document.querySelector('.id-change-warning');
    
    if (!currentUser) {
        console.log('currentUser не загружен');
        return;
    }
    
    console.log('Обновляем UI с данными:', currentUser.name, currentUser.uniqueId);
    
    if (userNameEl) userNameEl.textContent = currentUser.name || currentUser.email || 'Пользователь';
    if (userIdEl) userIdEl.textContent = currentUser.uniqueId || 'ID...';
    if (profileNameEl) profileNameEl.value = currentUser.name || '';
    if (profileEmailEl) profileEmailEl.value = currentUser.email || '';
    if (profileIdEl) profileIdEl.value = currentUser.uniqueId || '';
    if (profileBioEl) profileBioEl.value = currentUser.bio || '';
    
    const hasChangedId = currentUser.lastIdChange && currentUser.lastIdChange > 0;
    
    if (hasChangedId) {
        const daysSinceLastChange = (Date.now() - currentUser.lastIdChange) / (1000 * 60 * 60 * 24);
        const canChangeAgain = daysSinceLastChange >= 7;
        
        if (canChangeAgain) {
            if (lastIdChangeEl) {
                lastIdChangeEl.textContent = '✅ Вы можете изменить ID';
                lastIdChangeEl.style.color = '#00ff88';
            }
        } else {
            const daysLeft = Math.ceil(7 - daysSinceLastChange);
            const hoursLeft = Math.ceil((7 - daysSinceLastChange) * 24);
            let timeText = daysLeft > 0 ? `${daysLeft} дн` : `${hoursLeft} ч`;
            if (lastIdChangeEl) {
                lastIdChangeEl.textContent = `⚠️ ID был изменен ${formatTimeAgo(currentUser.lastIdChange)}. Следующая смена через ${timeText}`;
                lastIdChangeEl.style.color = '#ffaa00';
            }
        }
    } else {
        if (lastIdChangeEl) {
            lastIdChangeEl.textContent = '✨ ID не менялся';
            lastIdChangeEl.style.color = 'rgba(255,255,255,0.5)';
        }
    }
    
    if (idChangeWarningEl) idChangeWarningEl.style.display = 'block';
    
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) {
        if (currentUser.avatar) {
            sidebarAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            sidebarAvatar.innerHTML = '👤';
        }
    }
    
    const profileAvatar = document.getElementById('profileAvatarLarge');
    if (profileAvatar) {
        if (currentUser.avatar) {
            profileAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            profileAvatar.innerHTML = '👤';
        }
    }
    
    const profileCover = document.getElementById('profileCover');
    if (profileCover) {
        if (currentUser.cover) {
            profileCover.style.backgroundImage = `url(${currentUser.cover})`;
            profileCover.style.backgroundSize = 'cover';
            profileCover.style.backgroundPosition = 'center';
        } else {
            profileCover.style.backgroundImage = 'linear-gradient(135deg, #1a1a1a, #0a0a0a)';
        }
    }
}

async function changeUserId() {
    const newId = document.getElementById('profileIdInput').value.trim().toUpperCase();
    if (!newId) {
        showToast('Введите новый ID', true);
        return;
    }
    
    if (newId === currentUser.uniqueId) {
        showToast('Это ваш текущий ID', true);
        return;
    }
    
    if (!/^ID[A-Z0-9]{8}$/.test(newId)) {
        showToast('ID должен быть формата IDXXXXXXXX (8 символов, буквы и цифры)', true);
        return;
    }
    
    const hasChangedBefore = currentUser.lastIdChange && currentUser.lastIdChange > 0;
    if (hasChangedBefore) {
        const daysSinceLastChange = (Date.now() - currentUser.lastIdChange) / (1000 * 60 * 60 * 24);
        if (daysSinceLastChange < 7) {
            const daysLeft = Math.ceil(7 - daysSinceLastChange);
            showToast(`ID можно изменить через ${daysLeft} дней`, true);
            return;
        }
    }
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].uniqueId === newId && users[key].email !== currentUser.email) {
            showToast('Этот ID уже занят', true);
            return;
        }
    }
    
    const oldId = currentUser.uniqueId;
    const now = Date.now();
    
    await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), {
        uniqueId: newId,
        lastIdChange: now
    });
    
    currentUser.uniqueId = newId;
    currentUser.lastIdChange = now;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    for (let key in users) {
        if (users[key].friends && users[key].friends.includes(oldId)) {
            const newFriends = users[key].friends.map(id => id === oldId ? newId : id);
            await firebaseUpdate(firebaseRef(db, 'users/' + key), { friends: newFriends });
        }
    }
    
    const messagesRef = firebaseRef(db, 'messages');
    const messagesSnapshot = await firebaseGet(messagesRef);
    const messages = messagesSnapshot.val();
    if (messages) {
        for (let chatId in messages) {
            let needUpdate = false;
            const updatedMessages = {};
            for (let msgKey in messages[chatId]) {
                const msg = messages[chatId][msgKey];
                if (msg.from === oldId) {
                    msg.from = newId;
                    needUpdate = true;
                }
                if (msg.to === oldId) {
                    msg.to = newId;
                    needUpdate = true;
                }
                updatedMessages[msgKey] = msg;
            }
            if (needUpdate) {
                await firebaseSet(firebaseRef(db, 'messages/' + chatId), updatedMessages);
            }
        }
    }
    
    showToast(`✅ ID изменен на ${newId}`);
    updateUserUI();
    document.getElementById('profileModal').classList.remove('show');
}

async function saveProfile() {
    const newName = document.getElementById('profileNameInput').value.trim();
    const newBio = document.getElementById('profileBioInput').value.trim();
    
    if (!newName) {
        showToast('Имя не может быть пустым', true);
        return;
    }
    
    await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), {
        name: newName,
        bio: newBio || ''
    });
    
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
            await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { avatar: avatarData });
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
            
            await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { 
                cover: coverData 
            });
            
            currentUser.cover = coverData;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            const profileCover = document.getElementById('profileCover');
            if (profileCover) {
                profileCover.style.backgroundImage = `url(${coverData})`;
                profileCover.style.backgroundSize = 'cover';
                profileCover.style.backgroundPosition = 'center';
            }
            
            showToast('✅ Обложка обновлена!');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ========== ПРОФИЛЬ ДРУГА ==========

async function showFriendProfile(friendId, friendName) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let friendData = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            friendData = { ...users[key], id: key };
            break;
        }
    }
    
    if (!friendData) {
        showToast('Данные пользователя не найдены', true);
        return;
    }
    
    let modal = document.getElementById('friendProfileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'friendProfileModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content friend-profile-modal">
                <button class="close-modal" id="closeFriendProfileModal">✕</button>
                <div class="friend-profile-header">
                    <div class="friend-profile-avatar" id="friendProfileAvatar">👤</div>
                    <div class="friend-profile-name" id="friendProfileName"></div>
                    <div class="friend-profile-id" id="friendProfileId"></div>
                </div>
                <div class="friend-profile-bio" id="friendProfileBio"></div>
                <div class="friend-profile-stats">
                    <div class="friend-profile-stat">
                        <div class="friend-profile-stat-value" id="friendMutualFriends">0</div>
                        <div class="friend-profile-stat-label">Общих друзей</div>
                    </div>
                </div>
                <button id="sendMessageToFriendBtn" class="submit-btn">💬 Написать сообщение</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeFriendProfileModal').onclick = () => {
            modal.classList.remove('show');
        };
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };
    }
    
    document.getElementById('friendProfileName').textContent = friendData.name;
    document.getElementById('friendProfileId').textContent = friendData.uniqueId;
    document.getElementById('friendProfileBio').textContent = friendData.bio || 'Пользователь ничего не рассказал о себе';
    
    const avatarEl = document.getElementById('friendProfileAvatar');
    if (friendData.avatar) {
        avatarEl.innerHTML = `<img src="${friendData.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
        avatarEl.innerHTML = '👤';
    }
    
    const currentUserFriends = currentUser.friends || [];
    const friendFriends = friendData.friends || [];
    const mutualFriends = currentUserFriends.filter(id => friendFriends.includes(id));
    document.getElementById('friendMutualFriends').textContent = mutualFriends.length;
    
    document.getElementById('sendMessageToFriendBtn').onclick = () => {
        modal.classList.remove('show');
        handleChatClick(friendId, friendData.name);
        document.querySelector('.nav-item[data-page="chats"]').click();
    };
    
    modal.classList.add('show');
}

window.showFriendProfile = showFriendProfile;

// ========== ПРОФИЛЬ ДРУГА В ЧАТЕ ==========
async function showFriendProfileFromChat() {
    if (!currentChat) return;
    await showFriendProfile(currentChat.id, currentChat.name);
}

// ========== ЗАГРУЗКА ДРУЗЕЙ ==========

async function loadFriends() {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    if (!users) return;
    
    let currentUserData = null;
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUserData = users[key];
            currentUser.id = key;
            currentUser.friends = users[key].friends || [];
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
                    avatar: users[key].avatar,
                    bio: users[key].bio
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
            <div class="friend-avatar" onclick="window.showFriendProfile('${friend.uniqueId}', '${escapeHtml(friend.name)}')" style="cursor:pointer">${friend.avatar ? `<img src="${friend.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
            <div class="friend-info" onclick="window.showFriendProfile('${friend.uniqueId}', '${escapeHtml(friend.name)}')" style="cursor:pointer">
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            handleChatClick(friendId, friendName);
            document.querySelector('.nav-item[data-page="chats"]').click();
        });
    });
    
    document.querySelectorAll('.friend-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const friendId = btn.dataset.id;
            if (confirm('Удалить друга?')) {
                await removeFriend(friendId);
            }
        });
    });
}

// ========== ЧАТЫ ==========

async function loadChats() {
    await loadFriends();
}

async function removeFriend(friendId) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let friendUserKey = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            friendUserKey = key;
            break;
        }
    }
    
    if (currentUser.id && friendUserKey) {
        let currentFriends = currentUser.friends || [];
        currentFriends = currentFriends.filter(id => id !== friendId);
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { friends: currentFriends });
        currentUser.friends = currentFriends;
        
        let friendFriends = users[friendUserKey].friends || [];
        friendFriends = friendFriends.filter(id => id !== currentUser.uniqueId);
        await firebaseUpdate(firebaseRef(db, 'users/' + friendUserKey), { friends: friendFriends });
        
        showToast('Друг удален');
        await loadFriends();
        
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
    
    const currentFriends = currentUser.friends || [];
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
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { friends: updatedFriends });
        currentUser.friends = updatedFriends;
        
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
    
    // Делаем аватар в чате кликабельным
    const chatAvatar = document.querySelector('.chat-contact-avatar');
    if (chatAvatar) {
        chatAvatar.style.cursor = 'pointer';
        chatAvatar.onclick = () => showFriendProfileFromChat();
    }
    
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

// ========== ЛЕНТА ==========

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
                <div class="post-avatar" onclick="window.showFriendProfile('${post.authorId}', '${escapeHtml(post.authorName)}')" style="cursor:pointer">${post.authorAvatar ? `<img src="${post.authorAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
                <div onclick="window.showFriendProfile('${post.authorId}', '${escapeHtml(post.authorName)}')" style="cursor:pointer">
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

// ========== НАВИГАЦИЯ ==========

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

function setupEventListeners() {
    document.getElementById('logoutBtnSidebar').onclick = () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };
    
    document.getElementById('openProfileBtn').onclick = async () => {
        await loadCurrentUser();
        updateUserUI();
        document.getElementById('profileModal').classList.add('show');
    };
    document.getElementById('closeProfileModal').onclick = () => {
        document.getElementById('profileModal').classList.remove('show');
    };
    document.getElementById('saveProfileChangesBtn').onclick = saveProfile;
    document.getElementById('changeAvatarBtn').onclick = changeAvatar;
    document.getElementById('changeCoverBtn').onclick = changeCover;
    document.getElementById('changeIdBtn').onclick = changeUserId;
    
    document.getElementById('addFriendHeaderBtn').onclick = () => {
        document.getElementById('addFriendModal').classList.add('show');
    };
    document.getElementById('closeAddFriendModal').onclick = () => {
        document.getElementById('addFriendModal').classList.remove('show');
        document.getElementById('friendIdInput').value = '';
        document.getElementById('searchResultModal').innerHTML = '';
    };
    document.getElementById('searchFriendBtnModal').onclick = searchAndAddFriend;
    
    document.getElementById('sendMessageBtn').onclick = sendMessage;
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('deleteChatBtn').onclick = deleteChat;
    
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
    
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('show');
        };
    });
    
    setupMediaPreview();
    
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

// ========== МОБИЛЬНАЯ НАВИГАЦИЯ ==========

let isMobile = window.innerWidth <= 768;

function checkMobile() {
    isMobile = window.innerWidth <= 768;
    return isMobile;
}

function openChatMobile(friendId, friendName) {
    if (!isMobile) {
        openChat(friendId, friendName);
        return;
    }
    
    if (messageUnsubscribe) {
        messageUnsubscribe();
    }
    
    currentChat = { id: friendId, name: friendName };
    
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'none';
    if (chatArea) {
        chatArea.classList.add('active');
        chatArea.style.display = 'flex';
    }
    
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
    
    // Делаем аватар в чате кликабельным на мобильных
    const chatAvatar = document.querySelector('.chat-contact-avatar');
    if (chatAvatar) {
        chatAvatar.style.cursor = 'pointer';
        chatAvatar.onclick = () => showFriendProfileFromChat();
    }
    
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    
    messageUnsubscribe = firebaseOnValue(messagesRef, (snapshot) => {
        const messages = snapshot.val();
        renderMessages(messages ? Object.values(messages).sort((a,b) => a.id - b.id) : []);
    });
}

function closeChatMobile() {
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'flex';
    if (chatArea) {
        chatArea.classList.remove('active');
        chatArea.style.display = 'none';
    }
    
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
    
    currentChat = null;
}

function handleChatClick(friendId, friendName) {
    if (isMobile) {
        openChatMobile(friendId, friendName);
    } else {
        openChat(friendId, friendName);
    }
}

function renderChats(friends) {
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

window.addEventListener('resize', () => {
    isMobile = window.innerWidth <= 768;
    if (!isMobile) {
        closeChatMobile();
        const chatsSidebar = document.querySelector('.chats-sidebar');
        if (chatsSidebar) chatsSidebar.style.display = 'flex';
    }
});

// ===== МОБИЛЬНОЕ МЕНЮ =====
function setupMobileNav() {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    const pages = document.querySelectorAll('.page');
    
    if (!mobileNavItems.length) return;
    
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            
            mobileNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            pages.forEach(page => page.classList.remove('active'));
            
            if (pageName === 'profile') {
                document.getElementById('profileModal').classList.add('show');
                const activePage = document.querySelector('.page.active');
                if (activePage) activePage.classList.add('active');
                mobileNavItems.forEach(nav => nav.classList.remove('active'));
                const prevActive = document.querySelector(`.mobile-nav-item[data-page="${activePage?.id?.replace('Page', '')}"]`);
                if (prevActive) prevActive.classList.add('active');
            } else {
                const targetPage = document.getElementById(`${pageName}Page`);
                if (targetPage) targetPage.classList.add('active');
            }
            
            if (pageName === 'feed') {
                loadFeed();
            }
        });
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function init() {
    console.log('Инициализация...');
    await waitForFirebase();
    await loadCurrentUser();
    setupNavigation();
    setupEventListeners();
    await loadFriends();
    await loadFeed();
    updateUserUI();
    checkMobile();
    setupMobileNav();
    console.log('Готово!');
}

// ЗАПУСК
init();