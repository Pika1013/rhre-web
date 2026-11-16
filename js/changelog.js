// 更新内容（新しい版を先頭に）。版を上げるたびに、ここの先頭に日本語（ja）と英語（en）で足す。
// v1.13.0 からは、ほかの画面の言語（'zh-Hant'・ko・es・fr・de）でも書く（書いていない版は英語で出る）。
// アップデートのあとに開くと「アップデートしました！」のお知らせが出て、前に見た版より新しい分を見せる。
// 使う人に向けた短い言葉で書く。隠し機能は書かない
export const CHANGELOG = [
  {
    v: '1.17.0', date: '2026-11-16',
    ja: [
      'パソコンで、RHRE fresh と同じキーで操作できるようになりました。A・D か ←・→ を押している間は左右に動きます（Shift か Ctrl も押すと速い）',
      'W・S か ↑・↓ で選んだブロックの音程、Shift+スペースで一時停止、Home・End・M で 0 拍目・最後のブロック・音楽の開始位置へ動きます',
      'Ctrl+X（切り取り）、Ctrl+A（全部選ぶ）、Ctrl+F・R・T（選んだブロックより後ろ・前・間を全部選ぶ）、Ctrl+N・O・E（新規作成・開く・音声のみ書き出す）も使えます',
      'キーの一覧は、メニューの「キーボードの操作」で見られます（パソコンなど、キーボードかマウスのある端末だけ）',
      '使い方の「スペースで A ボタン」という古い説明を直しました（スペースは再生・停止です）',
    ],
    en: [
      'On a computer, you can now use the same keys as RHRE fresh. Hold A/D or ←/→ to move left and right (add Shift or Ctrl to go faster).',
      'W/S or ↑/↓ change the pitch of the selected blocks, Shift+Space pauses, and Home, End and M jump to beat 0, the last block and the music start.',
      'Ctrl+X (cut), Ctrl+A (select all), Ctrl+F/R/T (select everything after / before / between the selected blocks) and Ctrl+N/O/E (new / open / export audio only) also work.',
      'See all the keys with "Keyboard shortcuts" in the menu (only on devices with a keyboard or mouse).',
      'Fixed the old help text saying Space is the A button (Space plays and stops).',
    ],
    'zh-Hant': [
      '在電腦上，現在可以用和 RHRE fresh 相同的按鍵操作。按住 A／D 或 ←／→ 可以左右移動（同時按 Shift 或 Ctrl 會更快）。',
      'W／S 或 ↑／↓ 改變所選方塊的音高，Shift+空白鍵暫停，Home、End、M 移到第 0 拍、最後的方塊、音樂開始位置。',
      '也能使用 Ctrl+X（剪下）、Ctrl+A（全選）、Ctrl+F／R／T（選取所選方塊之後／之前／之間的全部）、Ctrl+N／O／E（新建／開啟／僅匯出音訊）。',
      '按鍵清單可以在選單的「鍵盤操作」查看（只在有鍵盤或滑鼠的裝置上）。',
      '修正了使用說明中「空白鍵是 A 按鈕」的舊說明（空白鍵是播放／停止）。',
      '選單的「新建」在繁體中文中顯示為英文的問題已修正。',
    ],
    ko: [
      '컴퓨터에서 RHRE fresh와 같은 키로 조작할 수 있게 되었어요. A/D 또는 ←/→를 누르고 있으면 좌우로 움직여요(Shift나 Ctrl도 누르면 빨라요).',
      'W/S 또는 ↑/↓로 선택한 블록의 음정, Shift+스페이스로 일시 정지, Home·End·M으로 0박·마지막 블록·음악 시작 위치로 이동해요.',
      'Ctrl+X(잘라내기), Ctrl+A(모두 선택), Ctrl+F/R/T(선택한 블록보다 뒤/앞/사이를 모두 선택), Ctrl+N/O/E(새로 만들기/열기/오디오만 내보내기)도 쓸 수 있어요.',
      '키 목록은 메뉴의 "키보드 조작"에서 볼 수 있어요(키보드나 마우스가 있는 기기에서만).',
      '도움말의 "스페이스가 A 버튼"이라는 옛 설명을 고쳤어요(스페이스는 재생/정지예요).',
      '메뉴의 "새로 만들기"가 영어로 나오던 것을 고쳤어요.',
    ],
    es: [
      'En un ordenador ya puedes usar las mismas teclas que en RHRE fresh. Mantén A/D o ←/→ para moverte a izquierda y derecha (añade Shift o Ctrl para ir más rápido).',
      'W/S o ↑/↓ cambian el tono de los bloques seleccionados, Shift+Espacio pausa, y Inicio, Fin y M saltan al pulso 0, al último bloque y al inicio de la música.',
      'También funcionan Ctrl+X (cortar), Ctrl+A (seleccionar todo), Ctrl+F/R/T (seleccionar todo después / antes / entre los bloques seleccionados) y Ctrl+N/O/E (nuevo / abrir / exportar solo audio).',
      'Consulta todas las teclas en "Atajos de teclado" del menú (solo en dispositivos con teclado o ratón).',
      'Se corrigió el texto antiguo de la ayuda que decía que Espacio es el botón A (Espacio reproduce y detiene).',
      '"Nuevo" en el menú ya no aparece en inglés.',
    ],
    fr: [
      "Sur ordinateur, vous pouvez maintenant utiliser les mêmes touches que dans RHRE fresh. Maintenez A/D ou ←/→ pour aller à gauche et à droite (ajoutez Shift ou Ctrl pour aller plus vite).",
      "W/S ou ↑/↓ changent la hauteur des blocs sélectionnés, Shift+Espace met en pause, et Début, Fin et M vont au temps 0, au dernier bloc et au début de la musique.",
      "Ctrl+X (couper), Ctrl+A (tout sélectionner), Ctrl+F/R/T (sélectionner tout après / avant / entre les blocs sélectionnés) et Ctrl+N/O/E (nouveau / ouvrir / exporter l'audio seul) fonctionnent aussi.",
      "Retrouvez toutes les touches dans « Raccourcis clavier » du menu (seulement sur les appareils avec clavier ou souris).",
      "Correction de l'ancien texte de l'aide qui disait qu'Espace est le bouton A (Espace lance et arrête la lecture).",
      "« Nouveau » dans le menu ne s'affiche plus en anglais.",
    ],
    de: [
      'Am Computer kannst du jetzt dieselben Tasten wie in RHRE fresh benutzen. Halte A/D oder ←/→, um dich nach links und rechts zu bewegen (mit Shift oder Strg schneller).',
      'W/S oder ↑/↓ ändern die Tonhöhe der ausgewählten Blöcke, Shift+Leertaste pausiert, und Pos1, Ende und M springen zu Schlag 0, zum letzten Block und zum Musikstart.',
      'Außerdem gehen Strg+X (ausschneiden), Strg+A (alles auswählen), Strg+F/R/T (alles nach / vor / zwischen den ausgewählten Blöcken auswählen) und Strg+N/O/E (neu / öffnen / nur Audio exportieren).',
      'Alle Tasten findest du im Menü unter „Tastenkürzel“ (nur auf Geräten mit Tastatur oder Maus).',
      'Den alten Hilfetext, nach dem die Leertaste der A-Knopf ist, korrigiert (die Leertaste spielt ab und stoppt).',
      '„Neu“ im Menü wird nicht mehr auf Englisch angezeigt.',
    ],
  },
  {
    v: '1.16.0', date: '2026-11-15',
    ja: [
      '「みんなで編集」の部屋では、開く・サンプル・新規作成、部屋の曲を決める、トラックの数・上下反転は、部屋を作った人だけができるようになりました',
      'ほかの人が押すと、部屋を作った人に許可をお願いできます。許可されると、その操作ができます',
      '部屋を作った人（または許可された人）がファイルを開くと、部屋のリミックスが全員の分入れ替わります',
    ],
    en: [
      'In "Edit together" rooms, open, open sample and new, choosing the room\'s song, the number of tracks and flipping tracks can now only be done by the host.',
      'If someone else presses them, they can ask the host for permission. Once allowed, they can do it.',
      'When the host (or someone allowed) opens a file, the room\'s remix is replaced for everyone.',
    ],
    'zh-Hant': [
      '「一起編輯」的房間中，開啟、開啟範例、新建、決定房間的歌曲、音軌數量、上下翻轉音軌，現在只有房主能做。',
      '其他人按下時，可以向房主請求許可。獲得許可後就能進行。',
      '房主（或獲得許可的人）開啟檔案時，房間的混音會替所有人替換。',
    ],
    ko: [
      '"함께 편집" 방에서는 열기·샘플 열기·새로 만들기, 방의 곡 정하기, 트랙 수·위아래 뒤집기를 방장만 할 수 있게 되었어요.',
      '다른 사람이 누르면 방장에게 허락을 요청할 수 있어요. 허락받으면 할 수 있어요.',
      '방장(또는 허락받은 사람)이 파일을 열면 모두의 방 리믹스가 바뀌어요.',
    ],
    es: [
      'En las salas de "Editar juntos", abrir, abrir el ejemplo y nuevo, elegir la canción de la sala, el número de pistas e invertir pistas ahora solo los puede hacer el anfitrión.',
      'Si otra persona los pulsa, puede pedirle permiso al anfitrión. Si se lo concede, puede hacerlo.',
      'Cuando el anfitrión (o alguien con permiso) abre un archivo, el remix de la sala se reemplaza para todos.',
    ],
    fr: [
      "Dans les salons « Éditer ensemble », ouvrir, ouvrir l'exemple et nouveau, choisir la chanson du salon, le nombre de pistes et inverser les pistes ne peuvent maintenant être faits que par l'hôte.",
      "Si quelqu'un d'autre appuie dessus, il peut demander l'autorisation à l'hôte. Une fois autorisé, il peut le faire.",
      "Quand l'hôte (ou une personne autorisée) ouvre un fichier, le remix du salon est remplacé pour tout le monde.",
    ],
    de: [
      'In Räumen von „Gemeinsam bearbeiten“ können Öffnen, Beispiel öffnen und Neu, das Lied des Raums wählen, die Anzahl der Spuren und das Umdrehen der Spuren jetzt nur noch vom Gastgeber gemacht werden.',
      'Wenn jemand anderes darauf drückt, kann er den Gastgeber um Erlaubnis bitten. Mit Erlaubnis kann er es tun.',
      'Wenn der Gastgeber (oder jemand mit Erlaubnis) eine Datei öffnet, wird der Remix des Raums für alle ersetzt.',
    ],
  },
  {
    v: '1.15.2', date: '2026-11-15',
    ja: ['「みんなで編集」で、部屋を作った人が部屋の名前を付けられるようになりました（20 文字まで）。名前は部屋の画面・下の段の札・公開の部屋の一覧に出ます'],
    en: ['In "Edit together", the host can now name the room (up to 20 characters). The name shows in the room window, on the badge at the bottom and in the public room list.'],
    'zh-Hant': ['「一起編輯」中，房主現在可以為房間取名（最多 20 個字）。名稱會顯示在房間畫面、下方的標籤和公開房間清單中。'],
    ko: ['"함께 편집"에서 방장이 방 이름을 붙일 수 있게 되었어요(최대 20자). 이름은 방 화면, 아래쪽 표시, 공개 방 목록에 나와요.'],
    es: ['En "Editar juntos", el anfitrión ahora puede poner nombre a la sala (hasta 20 caracteres). El nombre aparece en la ventana de la sala, en la etiqueta de abajo y en la lista de salas públicas.'],
    fr: ["Dans « Éditer ensemble », l'hôte peut maintenant nommer le salon (20 caractères max.). Le nom apparaît dans la fenêtre du salon, sur l'étiquette en bas et dans la liste des salons publics."],
    de: ['In „Gemeinsam bearbeiten“ kann der Gastgeber dem Raum jetzt einen Namen geben (bis zu 20 Zeichen). Der Name erscheint im Raumfenster, auf dem Schild unten und in der Liste der öffentlichen Räume.'],
  },
  {
    v: '1.15.1', date: '2026-11-15',
    ja: ['左上のメニューのボタンの下に、「みんなで編集ができるようになりました！」のお知らせを出しました（タップするか、メニューを開くと消えます）'],
    en: ['Added a "You can now edit together!" note under the menu button at the top left (it disappears when you tap it or open the menu).'],
    'zh-Hant': ['在左上角選單按鈕的下方，加上了「現在可以一起編輯了！」的提示（點一下或打開選單就會消失）。'],
    ko: ['왼쪽 위 메뉴 버튼 아래에 "이제 함께 편집할 수 있어요!" 알림을 넣었어요(탭하거나 메뉴를 열면 사라져요).'],
    es: ['Se añadió un aviso "¡Ya puedes editar juntos!" debajo del botón de menú, arriba a la izquierda (desaparece al tocarlo o al abrir el menú).'],
    fr: ["Ajout d'un message « Vous pouvez maintenant éditer ensemble ! » sous le bouton de menu en haut à gauche (il disparaît quand vous le touchez ou ouvrez le menu)."],
    de: ['Unter dem Menüknopf oben links erscheint jetzt der Hinweis „Du kannst jetzt gemeinsam bearbeiten!“ (er verschwindet, wenn du ihn antippst oder das Menü öffnest).'],
  },
  {
    v: '1.15.0', date: '2026-11-15',
    ja: [
      'メニューに「みんなで編集」ができました。友だちなどと同じリミックスを一緒に編集できます（10 人まで）。だれかがブロックを置いたり動かしたりすると、ほかの人の画面にもすぐ出ます',
      '部屋は 2 種類です。「友だちだけの部屋」は 6 文字の合言葉を知っている人だけが入れます。「公開の部屋」はだれでも一覧から「入りたい」を送れて、部屋を作った人が許可した人だけが入れます',
      '部屋の曲は、部屋の人の端末どうしで直接届きます（サーバーには残りません）。部屋を作った人は「みんなで再生」で、全員の端末で同時に再生できます',
      'くわしくは、メニューの「使い方」の「みんなで編集」を見てください',
    ],
    en: [
      'New "Edit together" in the menu: edit the same remix together with friends and others (up to 10 people). When someone places or moves a block, it shows up on everyone\'s screen right away.',
      'There are two kinds of rooms. A "Friends-only room" can be joined only by people who know its 6-character code. Anyone can ask to join a "Public room" from the list, and only the people the host allows can join.',
      'The room\'s song goes directly between the devices in the room (it is never kept on a server). The host can use "Play together" to start playback on everyone\'s device at the same time.',
      'For details, see "Edit together" in Help in the menu.',
    ],
    'zh-Hant': [
      '選單新增了「一起編輯」。可以和朋友等人一起編輯同一個混音（最多 10 人）。有人放置或移動方塊時，其他人的畫面也會馬上出現。',
      '房間有 2 種。「好友限定房間」只有知道 6 個字元代碼的人能進來。「公開房間」任何人都能從清單申請加入，只有房主允許的人才能進來。',
      '房間的歌曲會在房間裡的人的裝置之間直接傳送（不會留在伺服器上）。房主可以用「一起播放」讓所有人的裝置同時播放。',
      '詳細內容請看選單「使用說明」中的「一起編輯」。',
    ],
    ko: [
      '메뉴에 "함께 편집"이 생겼어요. 친구 등과 같은 리믹스를 함께 편집할 수 있어요(최대 10명). 누가 블록을 놓거나 움직이면 다른 사람 화면에도 바로 나와요.',
      '방은 2종류예요. "친구 전용 방"은 6자리 코드를 아는 사람만 들어올 수 있어요. "공개 방"은 누구나 목록에서 참가를 요청할 수 있고, 방장이 허락한 사람만 들어와요.',
      '방의 곡은 방에 있는 사람들의 기기끼리 직접 보내요(서버에는 남지 않아요). 방장은 "함께 재생"으로 모든 기기에서 동시에 재생할 수 있어요.',
      '자세한 내용은 메뉴의 "도움말"에서 "함께 편집"을 보세요.',
    ],
    es: [
      'Nuevo "Editar juntos" en el menú: edita el mismo remix con amigos y otras personas (hasta 10). Cuando alguien coloca o mueve un bloque, aparece al instante en la pantalla de todos.',
      'Hay dos tipos de salas. En una "Sala solo para amigos" solo entra quien conoce su código de 6 caracteres. A una "Sala pública" cualquiera puede pedir entrar desde la lista, y solo entran las personas que el anfitrión permita.',
      'La canción de la sala se envía directamente entre los dispositivos de la sala (nunca se guarda en un servidor). El anfitrión puede usar "Reproducir juntos" para reproducir en todos los dispositivos a la vez.',
      'Para más detalles, mira "Editar juntos" en la Ayuda del menú.',
    ],
    fr: [
      "Nouveau « Éditer ensemble » dans le menu : éditez le même remix avec des amis et d'autres personnes (jusqu'à 10). Quand quelqu'un place ou déplace un bloc, cela apparaît aussitôt sur l'écran de tous.",
      "Il y a deux types de salons. Seules les personnes qui connaissent le code à 6 caractères peuvent entrer dans un « Salon entre amis ». Tout le monde peut demander à entrer dans un « Salon public » depuis la liste, et seules les personnes autorisées par l'hôte peuvent le rejoindre.",
      "La chanson du salon est envoyée directement entre les appareils du salon (elle n'est jamais gardée sur un serveur). L'hôte peut utiliser « Lire ensemble » pour lancer la lecture sur tous les appareils en même temps.",
      "Pour plus de détails, consultez « Éditer ensemble » dans l'Aide du menu.",
    ],
    de: [
      'Neu im Menü: „Gemeinsam bearbeiten“. Bearbeite denselben Remix zusammen mit Freunden und anderen (bis zu 10 Leute). Wenn jemand einen Block platziert oder verschiebt, erscheint es sofort auf allen Bildschirmen.',
      'Es gibt zwei Arten von Räumen. Einem „Raum nur für Freunde“ kann nur beitreten, wer den 6-stelligen Code kennt. Bei einem „Öffentlichen Raum“ kann jeder in der Liste um Beitritt bitten, und nur wen der Gastgeber erlaubt, kann beitreten.',
      'Das Lied des Raums wird direkt zwischen den Geräten im Raum gesendet (es bleibt nie auf einem Server). Der Gastgeber kann mit „Gemeinsam abspielen“ die Wiedergabe auf allen Geräten gleichzeitig starten.',
      'Mehr dazu unter „Gemeinsam bearbeiten“ in der Hilfe im Menü.',
    ],
  },
  {
    v: '1.14.1', date: '2026-11-15',
    ja: [
      'ゲーム名の「ゐあひ斬り伝説」が「ゐあひ斬ぎり伝説」になっていたのを直しました',
      '再生を始める位置ちょうど（0 拍目など）に置いた音楽の音量の変更が、再生・音声の書き出し・動画の書き出しで効かないことがあったのを直しました',
    ],
    en: [
      'Fixed a typo in the Japanese name of Super Samurai Slice.',
      'Fixed music volume changes placed exactly at the playback start (such as beat 0) sometimes being ignored during playback, audio export and video export.',
    ],
    'zh-Hant': [
      '修正了 Super Samurai Slice 日文名稱的錯字。',
      '修正了放在播放開始位置（例如第 0 拍）的音樂音量變更，在播放、匯出音訊和匯出影片時有時不會生效的問題。',
    ],
    ko: [
      'Super Samurai Slice의 일본어 이름 오타를 고쳤어요.',
      '재생 시작 위치(0박 등)에 놓은 음악 음량 변경이 재생·오디오 내보내기·동영상 내보내기에서 적용되지 않을 때가 있던 문제를 고쳤어요.',
    ],
    es: [
      'Se corrigió una errata en el nombre japonés de Super Samurai Slice.',
      'Se corrigió que los cambios de volumen de la música colocados justo en el inicio de la reproducción (como el tiempo 0) a veces no se aplicaban al reproducir, al exportar audio y al exportar vídeo.',
    ],
    fr: [
      "Correction d'une faute dans le nom japonais de Super Samurai Slice.",
      "Correction : les changements de volume de la musique placés exactement au début de la lecture (comme le temps 0) étaient parfois ignorés pendant la lecture, l'export audio et l'export vidéo.",
    ],
    de: [
      'Tippfehler im japanischen Namen von Super Samurai Slice behoben.',
      'Behoben: Änderungen der Musiklautstärke genau am Wiedergabestart (z. B. Schlag 0) wurden bei der Wiedergabe sowie beim Audio- und Videoexport manchmal ignoriert.',
    ],
  },
  {
    v: '1.14.0', date: '2026-11-15',
    ja: [
      '「特殊」タブのブロックを、RHRE fresh と同じ作りにしました。一覧も RHRE fresh と同じく「Special Entities」「Visual Effects」に分かれています',
      '「Shake Screen」（画面揺れ）を置けるようになりました。再生中に画面が揺れます。音程を上げるほど強く揺れます',
      '画像は、画面の中央下ではなく、トラックの上にブロックと同じ幅で出るようになりました。画像が遅れて出ることもなくなりました',
      '「Song Title」（曲名）と「Song Artist」（アーティスト名）は、再生中に左右から帯で出るようになりました',
      'End Remix・字幕・プレイアロングのブロックの見た目も RHRE fresh と同じにしました。プレゼンテーションモードと動画では、字幕・画面揺れ・プレイアロングのブロックは出ません',
    ],
    en: [
      'The blocks in the "Special" tab now work like in RHRE fresh. The list is also split into "Special Entities" and "Visual Effects", as in RHRE fresh.',
      'You can now place "Shake Screen". The screen shakes during playback, and the higher its pitch, the stronger it shakes.',
      'Images are now drawn over the tracks, as wide as the block, instead of at the bottom center of the screen. They no longer show up late.',
      '"Song Title" and "Song Artist" now slide in as banners from the left and right during playback.',
      'End Remix, subtitle and Playalong blocks now look like in RHRE fresh. Subtitle, screen shake and Playalong blocks are hidden in presentation mode and in videos.',
    ],
    'zh-Hant': [
      '「特殊」分頁的方塊改成和 RHRE fresh 相同的做法。清單也和 RHRE fresh 一樣，分成「Special Entities」和「Visual Effects」。',
      '現在可以放置「Shake Screen」（畫面震動）。播放時畫面會震動，音高調得越高，震動越強。',
      '圖片不再顯示在畫面中央下方，而是以和方塊相同的寬度畫在音軌上。圖片也不會再慢一拍才出現。',
      '「Song Title」（曲名）和「Song Artist」（演出者）會在播放時以橫條從左右滑入。',
      'End Remix、字幕和 Playalong 方塊的外觀也和 RHRE fresh 相同。在展示模式和影片中，不會顯示字幕、畫面震動和 Playalong 的方塊。',
    ],
    ko: [
      '"특수" 탭의 블록을 RHRE fresh와 같은 방식으로 바꿨어요. 목록도 RHRE fresh처럼 "Special Entities"와 "Visual Effects"로 나뉘어요.',
      '"Shake Screen"(화면 흔들림)을 놓을 수 있게 되었어요. 재생 중에 화면이 흔들리고, 음정을 올릴수록 세게 흔들려요.',
      '이미지는 화면 가운데 아래가 아니라, 블록과 같은 폭으로 트랙 위에 나와요. 이미지가 늦게 나오는 일도 없어졌어요.',
      '"Song Title"(곡 이름)과 "Song Artist"(아티스트 이름)는 재생 중에 좌우에서 띠로 미끄러져 나와요.',
      'End Remix·자막·플레이얼롱 블록의 모양도 RHRE fresh와 같게 했어요. 프레젠테이션 모드와 동영상에서는 자막·화면 흔들림·플레이얼롱 블록이 나오지 않아요.',
    ],
    es: [
      'Los bloques de la pestaña "Especial" ahora funcionan como en RHRE fresh. La lista también se divide en "Special Entities" y "Visual Effects", como en RHRE fresh.',
      'Ya puedes colocar "Shake Screen" (temblor de pantalla). La pantalla tiembla durante la reproducción, y cuanto más alto el tono, más fuerte tiembla.',
      'Las imágenes ahora se dibujan sobre las pistas, con el ancho del bloque, en lugar de abajo en el centro de la pantalla. Ya no aparecen con retraso.',
      '"Song Title" (título) y "Song Artist" (artista) ahora entran como franjas desde la izquierda y la derecha durante la reproducción.',
      'Los bloques End Remix, de subtítulos y de Playalong ahora se ven como en RHRE fresh. Los bloques de subtítulos, temblor de pantalla y Playalong no se muestran en el modo presentación ni en los vídeos.',
    ],
    fr: [
      "Les blocs de l'onglet « Spécial » fonctionnent maintenant comme dans RHRE fresh. La liste est aussi séparée en « Special Entities » et « Visual Effects », comme dans RHRE fresh.",
      "Vous pouvez maintenant placer « Shake Screen » (tremblement d'écran). L'écran tremble pendant la lecture, et plus la hauteur est élevée, plus il tremble fort.",
      "Les images sont maintenant dessinées sur les pistes, à la largeur du bloc, au lieu d'en bas au centre de l'écran. Elles n'apparaissent plus en retard.",
      "« Song Title » (titre) et « Song Artist » (artiste) glissent maintenant depuis la gauche et la droite en bandeaux pendant la lecture.",
      "Les blocs End Remix, sous-titre et Playalong ressemblent maintenant à ceux de RHRE fresh. Les blocs de sous-titre, de tremblement d'écran et de Playalong sont masqués en mode présentation et dans les vidéos.",
    ],
    de: [
      'Die Blöcke im Tab „Spezial“ funktionieren jetzt wie in RHRE fresh. Die Liste ist wie in RHRE fresh in „Special Entities“ und „Visual Effects“ aufgeteilt.',
      'Du kannst jetzt „Shake Screen“ (Bildschirmwackeln) platzieren. Der Bildschirm wackelt während der Wiedergabe – je höher die Tonhöhe, desto stärker.',
      'Bilder werden jetzt über die Spuren gezeichnet, so breit wie der Block, statt unten in der Mitte des Bildschirms. Sie erscheinen nicht mehr verspätet.',
      '„Song Title“ (Titel) und „Song Artist“ (Interpret) gleiten während der Wiedergabe als Banner von links und rechts herein.',
      'End-Remix-, Untertitel- und Playalong-Blöcke sehen jetzt aus wie in RHRE fresh. Untertitel-, Bildschirmwackeln- und Playalong-Blöcke werden im Präsentationsmodus und in Videos ausgeblendet.',
    ],
  },
  {
    v: '1.13.0', date: '2026-11-15',
    ja: [
      '画面の言語に、繁體中文（台湾・香港）・한국어（韓国語）・Español（スペイン語）・Français（フランス語）・Deutsch（ドイツ語）が増えました。設定の「言語」→「画面の言語」で変えられます',
      'アップデートのあと、言語を選ぶ画面がもう一度出ます。今までと同じ言語を選べば、そのまま使えます',
      '英語の画面でも日本語のまま出ていたメッセージ（読み込み中・音声の書き出しなど）を、英語にしました',
    ],
    en: [
      'New interface languages: 繁體中文 (Traditional Chinese), 한국어 (Korean), Español (Spanish), Français (French) and Deutsch (German). Change it under Settings → Language → Interface language.',
      'After this update, the language picker shows once more. Pick the same language as before to keep things as they are.',
      'Some messages (loading, audio export and more) that still showed in Japanese in the English interface are now in English.',
    ],
    'zh-Hant': [
      '介面語言新增了繁體中文、한국어（韓文）、Español（西班牙文）、Français（法文）、Deutsch（德文）。可以在設定的「語言」→「介面語言」更改。',
      '更新後會再出現一次選擇語言的畫面。選和之前一樣的語言，就能照常使用。',
      '小遊戲和片段的名稱維持英文。',
    ],
    ko: [
      '화면 언어에 繁體中文(중국어 번체), 한국어, Español(스페인어), Français(프랑스어), Deutsch(독일어)가 추가되었어요. 설정의 "언어" → "화면 언어"에서 바꿀 수 있어요.',
      '업데이트 후에 언어 선택 화면이 한 번 더 나와요. 전과 같은 언어를 고르면 그대로 쓸 수 있어요.',
      '미니게임과 패턴 이름은 영어 그대로예요.',
    ],
    es: [
      'Nuevos idiomas de la interfaz: 繁體中文 (chino tradicional), 한국어 (coreano), Español, Français (francés) y Deutsch (alemán). Cámbialo en Configuración → Idioma → Idioma de la interfaz.',
      'Tras esta actualización, el selector de idioma aparece una vez más. Elige el mismo idioma que antes para seguir igual.',
      'Los nombres de los minijuegos y de los patrones siguen en inglés.',
    ],
    fr: [
      "Nouvelles langues d'interface : 繁體中文 (chinois traditionnel), 한국어 (coréen), Español (espagnol), Français et Deutsch (allemand). Changez-la dans Paramètres → Langue → Langue de l'interface.",
      "Après cette mise à jour, le choix de la langue s'affiche une fois de plus. Choisissez la même langue qu'avant pour ne rien changer.",
      'Les noms des mini-jeux et des motifs restent en anglais.',
    ],
    de: [
      'Neue Sprachen für die Oberfläche: 繁體中文 (traditionelles Chinesisch), 한국어 (Koreanisch), Español (Spanisch), Français (Französisch) und Deutsch. Ändern kannst du sie unter Einstellungen → Sprache → Sprache der Oberfläche.',
      'Nach diesem Update erscheint die Sprachauswahl noch einmal. Wähle dieselbe Sprache wie bisher, dann bleibt alles wie gewohnt.',
      'Die Namen der Minispiele und Muster bleiben auf Englisch.',
    ],
  },
  {
    v: '1.12.1', date: '2026-11-14',
    ja: ['iPhone・iPad でも「＋ フォルダを追加」が出るようになりました。カスタム効果音のフォルダを、zip にしなくてもそのまま入れられます（iOS 18.4 以降）'],
    en: ['"+ Add a folder" now also shows on iPhone and iPad, so you can add custom sound folders without zipping them (iOS 18.4 or later).'],
  },
  {
    v: '1.12.0', date: '2026-11-14',
    ja: [
      'カスタム効果音を、フォルダごと入れられるようになりました。PC 版の RHRE fresh の customSounds の中のフォルダを、そのまま追加できます（スマホでは zip にして）。「カスタム」のタブの「＋ zip を追加」（パソコンでは「＋ フォルダを追加」も）から入れられます',
      'フォルダ 1 つが 1 つのゲームになり、data.json と icon.png にも対応しています。PC 版で作ったカスタム効果音入りのリミックスも、同じフォルダを入れれば音が鳴ります',
      '入れたカスタム効果音は、一覧の上の「消す」で消せます',
    ],
    en: [
      'You can now add custom sounds as whole folders. Add a folder from RHRE fresh\'s customSounds folder as it is (on phones, as a .zip) with "+ Add a .zip" in the Custom tab (computers also have "+ Add a folder").',
      'Each folder becomes its own game, and data.json and icon.png work too. Remixes made on PC with custom sounds play correctly once you add the same folders.',
      'You can remove added custom sounds with "Remove" above the list.',
    ],
  },
  {
    v: '1.11.0', date: '2026-11-14',
    ja: [
      '設定の画面を作り直しました。左のメニューで「言語」「見た目」「編集画面」「プレイアロング」を選んで、右に中身が出ます',
      'メトロノームを入れたときに跳ねるプレイやんを、出さないようにもできます（設定の「編集画面」→「メトロノームのプレイやん」）',
    ],
    en: [
      'The Settings screen has a new layout: pick Language, Appearance, Editor or Playalong from the menu on the left, and the options show on the right.',
      'You can now hide Play-Yan, who jumps while the metronome is on (Settings → Editor → "Play-Yan with the metronome").',
    ],
  },
  {
    v: '1.10.0', date: '2026-11-14',
    ja: [
      'ゲーム名を日本語で出せるようになりました（例：Karate Man (GBA) → カラテ家 (GBA)）。設定の「ゲーム名」で、いつでも日本語と英語を切り替えられます',
      'ゲームの検索は、日本語の名前でもできます（ひらがなでもカタカナでも大丈夫です）',
    ],
    en: [
      'Minigame names can now be shown in Japanese (e.g. Karate Man (GBA) → カラテ家 (GBA)). Switch between Japanese and English any time under "Game names" in Settings.',
      'You can now search minigames by their Japanese names too.',
    ],
  },
  {
    v: '1.9.21', date: '2026-11-13',
    ja: ['プレゼンテーションモードの左上の「終わる」を、文字のない丸い ✕ ボタンにしました'],
    en: ['The Exit button at the top left of presentation mode is now a round ✕ button without text.'],
  },
  {
    v: '1.9.20', date: '2026-11-13',
    ja: [
      'プレゼンテーションモードで再生しているあいだ、左上に今のゲーム（アイコンと名前）を出すようにしました（RHRE fresh と同じ）',
      '英語の画面で、プレイアロングの項目の「ボタン」の札が日本語のままだったのを直しました。言語を切り替えたときに、一覧の見出しが前の言語のまま残ることがあったのも直しました',
    ],
    en: [
      'While playing in presentation mode, the current game (icon and name) now shows at the top left, like in RHRE fresh.',
      'Fixed the "Button" tag on Playalong items staying in Japanese on the English screen, and the list heading sometimes staying in the previous language after switching languages.',
    ],
  },
  {
    v: '1.9.19', date: '2026-11-13',
    ja: ['ブロックを選んでいるときに光る小節で、明るい縦線が 1 拍ごとに来るようにしました（今までは半拍の所の線が明るく、拍とずれて見えました）'],
    en: ['In the highlighted measure while a block is selected, the brighter vertical lines now fall on each beat (before, the half-beat lines were brighter and looked off the beat).'],
  },
  {
    v: '1.9.18', date: '2026-11-13',
    ja: ['リンクを貼ったときに出る画像を、日本語のページは日本語の画面、英語のページは英語の画面にしました'],
    en: ['The picture shown when you share a link now matches the page language (Japanese screen for the Japanese page, English screen for the English page).'],
  },
  {
    v: '1.9.17', date: '2026-11-13',
    ja: ['リンクを貼ったときに出る画像を変えました'],
    en: ['Changed the picture shown when you share a link to RHRE Web.'],
  },
  {
    v: '1.9.16', date: '2026-11-13',
    ja: [
      'X などに RHRE Web のリンクを貼ったときに、アプリの画面の大きな画像が出るようにしました',
      '英語で探す人向けの紹介ページを作りました（https://pika1013.github.io/rhre-web/en/）',
    ],
    en: [
      'Sharing a link to RHRE Web (on X and other sites) now shows a large picture of the app.',
      'Added an English introduction page (https://pika1013.github.io/rhre-web/en/).',
    ],
  },
  {
    v: '1.9.15', date: '2026-11-13',
    ja: ['Google などの検索に出る、RHRE Web の説明の文を変えました（アプリの使い方は変わりません）'],
    en: ['Changed the description of RHRE Web shown in Google and other search results (nothing changes in the app).'],
  },
  {
    v: '1.9.14', date: '2026-11-13',
    ja: ['Extra Sound Effects の一番下に「拡張音源」を足して、新しい効果音「Cleared! (Switch)」を入れました。RHRE Web だけの音なので、使ったリミックスを PC 版の RHRE fresh で開くと、その音は鳴りません（初めて置くときに注意が出ます）'],
    en: ['Added "Expansion sounds" at the bottom of Extra Sound Effects, with a new sound, "Cleared! (Switch)". It exists only in RHRE Web, so it will not play if you open the remix in RHRE fresh on PC (a notice appears the first time you place it).'],
  },
  {
    v: '1.9.13', date: '2026-11-12',
    ja: ['Google などで検索したときに見つけてもらいやすいように、ページに説明を足しました（アプリの使い方は変わりません）'],
    en: ['Added a description to the page so it is easier to find on Google and other search engines (nothing changes in the app).'],
  },
  {
    v: '1.9.12', date: '2026-11-12',
    ja: ['テンポの自動検出で置いたテンポの変更は、音楽開始（赤い旗）を動かすと、曲と一緒に動くようにしました。自分で置いた・直したテンポは動きません'],
    en: ['Tempo changes placed by tempo auto-detect now move with the song when you move the music start (red flag). Tempo changes you placed or edited yourself stay put.'],
  },
  {
    v: '1.9.11', date: '2026-11-12',
    ja: [
      'パーフェクトチャレンジの失敗の音を、途中から再生したときも鳴らすようにしました。プレイモードに入ったときに音を先に読み込んでおくので、すぐ鳴ります',
      'iPhone ではボタンを押したときの振動ができなかったので、外しました（Android はそのまま振動します）',
    ],
    en: [
      'The Perfect Challenge fail sound now plays even when you start playback partway through. It is loaded when you enter play mode, so it plays right away.',
      'Removed button vibration on iPhone, since it could not vibrate there (Android still vibrates).',
    ],
  },
  {
    v: '1.9.10', date: '2026-11-12',
    ja: [
      '「パーフェクト挑戦」を「パーフェクトチャレンジ」に名前を変えました',
      'パーフェクトチャレンジの失敗の音が、鳴らないことがあったのを直しました（0 拍目に戻ったときや、最初のボタンと同じ所から再生したときなど）',
      'プレイモードでボタンを押したときの振動を、iPhone でももう一度試せるようにしました（iOS 17.4 以降）。Android は振動を少し長くして、感じやすくしました',
    ],
    en: [
      'Renamed it to "Perfect Challenge" in Japanese.',
      'Fixed the Perfect Challenge fail sound sometimes not playing (for example after going back to beat 0, or when playback starts right at the first button).',
      'Button-press vibration in play mode is back for iPhone as a try (iOS 17.4 or later). On Android the vibration is a little longer so it is easier to feel.',
    ],
  },
  {
    v: '1.9.9', date: '2026-11-12',
    ja: ['テンポの段の「ここをタップで…」の案内を、横に縮めないようにしました（入りきらない分は画面の左にはみ出します）'],
    en: ['The "Tap here to…" hint on the tempo row is no longer squeezed (the part that doesn\'t fit runs off the left edge).'],
  },
  {
    v: '1.9.8', date: '2026-11-12',
    ja: [
      'トラックの数え方を RHRE fresh と同じ「下から」にしました。RHRE Web で作った .rhref をパソコンの RHRE fresh で開くと、ブロックの段が上下逆になっていたのを直しました',
      'v1.9.7 までに RHRE Web で作ったリミックスは、上下が逆に見えます。メニューの「トラックの上下を反転」で直せます（そのあと保存してください）',
    ],
    en: [
      'Tracks are now counted from the bottom, like RHRE fresh. Fixed blocks appearing upside down when a .rhref made in RHRE Web was opened in RHRE fresh on PC.',
      'Remixes made with RHRE Web v1.9.7 or earlier now look upside down. Fix them with "Flip tracks upside down" in the menu (then save).',
    ],
  },
  {
    v: '1.9.7', date: '2026-11-12',
    ja: [
      '書き出した動画は、右下に「RHRE Web」と版、左下にサイトの URL を入れるようにしました',
      'メニューの「WAVに書き出す」を「音声のみ書き出す」に名前を変えました（中身は今までどおり WAV です）',
    ],
    en: [
      'Exported videos now show "RHRE Web" and the version in the bottom right, and the site URL in the bottom left.',
      'Renamed "Export WAV" in the menu to "Export audio only" (it still makes a WAV file).',
    ],
  },
  {
    v: '1.9.6', date: '2026-11-12',
    ja: ['書き出した動画の版と URL を左下に移し、URL は https:// から入れるようにしました'],
    en: ['Exported videos now show the version and URL in the bottom left, with the URL starting with https://.'],
  },
  {
    v: '1.9.5', date: '2026-11-12',
    ja: ['書き出した動画の右下の版の右に、サイトの URL（pika1013.github.io/rhre-web）を入れるようにしました'],
    en: ['Exported videos now show the site URL (pika1013.github.io/rhre-web) next to the version in the bottom right.'],
  },
  {
    v: '1.9.4', date: '2026-11-12',
    ja: ['再生中は、画面が自動で消えない（スリープしない）ようにしました。一時停止・停止すると元に戻ります（iPhone のホーム画面のアプリは iOS 18.4 以降）'],
    en: ['The screen no longer turns off (sleeps) during playback. It goes back to normal when you pause or stop (Home Screen app on iPhone: iOS 18.4 or later).'],
  },
  {
    v: '1.9.3', date: '2026-11-11',
    ja: ['動画の書き出しで、End Remix の所で再生のバーが止まり、1 秒待ってから動画が終わるようにしました（音楽もそこで止まり、鳴っている効果音の余韻は残ります）'],
    en: ['In video export, the playback bar now stops at End Remix and the video ends 1 second later (the music stops there too; sound effects already playing ring out).'],
  },
  {
    v: '1.9.2', date: '2026-11-11',
    ja: [
      '小節の途中の拍の縦線を、少し濃くしました',
      '小節の途中で拍子を変えたとき、編集中の小節のハイライトがずれていたのを直しました',
      '動画（と WAV）の書き出しは、End Remix があればそこでぴったり終わるようにしました（1 秒ほど通り過ぎていました）',
    ],
    en: [
      'Beat lines in the middle of a measure are a little darker.',
      'Fixed the measure highlight while editing being off when the time signature changes mid-measure.',
      'Video (and WAV) export now ends exactly at End Remix (it used to run about 1 second past it).',
    ],
  },
  {
    v: '1.9.1', date: '2026-11-11',
    ja: [
      'テンポの自動検出で、アウフタクト（小節の頭より前から鳴り始める）の曲は、2 小節目の頭から本編が始まるように音楽開始を合わせるようにしました（頭が切れないように）',
      'テンポの段の案内を「ここをタップでテンポ、拍子、音量を変更できます→」にして、文の終わりが -1 拍目に来るようにしました',
    ],
    en: [
      'Tempo auto-detect now handles songs that start with a pickup: the music start is set so the song proper begins at measure 2, so the pickup isn\'t cut off.',
      'The tempo row hint now reads "Tap here to change tempo, time signature and volume →" and ends at beat -1.',
    ],
  },
  {
    v: '1.9.0', date: '2026-11-11',
    ja: [
      '曲のテンポの「自動検出」を付けました（曲を選んだときのテンポの画面）。テンポは整数で見つけ、曲の途中で急に変わる所・だんだん変わる所には、テンポの変更も自動で置きます。倍や半分に聞こえるときは ×2・÷2 で直せます',
      'テンポの段の 0 拍目の手前に「ここをタップで音量、テンポ、拍子を変更できます」と小さく出すようにしました',
    ],
    en: [
      'Added tempo "Auto-detect" (on the song tempo screen). It finds the tempo as a whole number and also places tempo changes where the song suddenly or gradually changes tempo. Use ×2 / ÷2 if it sounds double or half.',
      'The tempo row now shows a small "Tap here to change volume, tempo and time signature" just before beat 0.',
    ],
  },
  {
    v: '1.8.5', date: '2026-11-11',
    ja: ['Guitar Lessons も、ギターの音（Assorted・Built to Scale・Glee Club）を各言語の一覧の一番下に並べました'],
    en: ['Guitar Lessons now also lists its guitar sounds (Assorted, Built to Scale, Glee Club) at the bottom of each language\'s list.'],
  },
  {
    v: '1.8.4', date: '2026-11-11',
    ja: [
      'DJ School の「Music Distortion」を置けるようにしました（パターンの下にあります）。その範囲だけ、音楽が細い音になります（RHRE fresh と同じ）',
      'Rockers のギターのコードなど、言語に関係ない音を、各言語の一覧の一番下に並べました',
      'どの効果音でも音程を変えられるようにしました（RHRE fresh の「Ignore pitch restrictions」と同じ）',
    ],
    en: [
      'You can now place DJ School\'s "Music Distortion" (below the patterns). The music sounds thin within its range, like in RHRE fresh.',
      'Rockers\' guitar chords and other language-independent sounds are now listed at the bottom of each language\'s list.',
      'You can now change the pitch of any sound effect (same as RHRE fresh\'s "Ignore pitch restrictions").',
    ],
  },
  {
    v: '1.8.3', date: '2026-11-11',
    ja: [
      '動画の書き出しが終わったら、進み具合のバーの場所に「動画を保存」ボタンが出るようにしました（小さい画面でボタンが隠れていたため）',
      '書き出した動画の右下に、小さく「RHRE Web」と版を入れるようにしました',
    ],
    en: [
      'When a video export finishes, the "Save video" button now appears where the progress bar was (it used to be hidden on small screens).',
      'Exported videos now show a small "RHRE Web" and version in the bottom right.',
    ],
  },
  {
    v: '1.8.2', date: '2026-11-11',
    ja: [
      '動画の左上に、今のゲームのアイコンと名前を出すようにしました（RHRE fresh と同じ）',
      '動画の再生位置の線の上に、テンポ・拍・時間を出すようにしました',
      '動画の最初のほうで、ブロックにゲームのアイコンが出ていなかったのを直しました',
    ],
    en: [
      'Videos now show the current game\'s icon and name in the top left, like RHRE fresh.',
      'Videos now show the tempo, beat and time above the playback line.',
      'Fixed game icons missing from blocks at the start of a video.',
    ],
  },
  {
    v: '1.8.1', date: '2026-11-11',
    ja: [
      'iPhone で書き出した動画に音が入っていなかったのを直しました',
      '動画の書き出しは、いつも 0 拍目から始まるようにしました。最初に 2 秒、止まった画面のまま待ってから再生します。動画には赤と緑の旗は出ません',
      'iPhone で「ファイルに保存」をすると、名前の書かれた .txt も一緒に保存されていたのを直しました',
    ],
    en: [
      'Fixed videos exported on iPhone having no sound.',
      'Video export now always starts from beat 0. It shows a still screen for 2 seconds before playback starts. The red and green flags are not shown in the video.',
      'Fixed an extra .txt file with the name being saved along with your file when using "Save to Files" on iPhone.',
    ],
  },
  {
    v: '1.8.0', date: '2026-11-11',
    ja: [
      '動画で書き出せるようになりました（メニューの「動画で書き出す」）。再生開始位置から最後までを、プレゼンテーションモードと同じ見た目の mp4 にします',
      'アップデートのあとに、何が変わったかをこの画面で見られるようになりました。メニューの「更新内容」からも、いつでも見られます',
    ],
    en: [
      'You can now export a video (menu → "Export video"). It turns your remix, from the playback start to the end, into an mp4 that looks like presentation mode.',
      'After an update, this screen now shows what changed. You can also open it any time from "What\'s new" in the menu.',
    ],
  },
  {
    v: '1.7.7', date: '2026-11-11',
    ja: ['「使い方」の説明を今の機能に合わせて書き直しました。英語の画面では英語の説明が出ます'],
    en: ['The Help screen now matches the current features, and it is in English when the screen language is English.'],
  },
  {
    v: '1.7.6', date: '2026-11-11',
    ja: ['ブロックの外まで音が続くもの（等間隔など）は、ブロックの外の部分を半透明にして、ブロック本体と見分けやすくしました'],
    en: ['For blocks whose sounds continue outside the block (equidistant patterns and so on), the part outside the block is now see-through, so the block itself is easier to tell apart.'],
  },
  {
    v: '1.7.5', date: '2026-11-11',
    ja: ['開いたままでも、新しい版が出たらお知らせが出るようになりました（再生中は止めてから）'],
    en: ['Even while the app stays open, you now get a notice when a new version is out (after you stop playback).'],
  },
  {
    v: '1.7.3', date: '2026-11-11',
    ja: [
      'ナイトモードの文字を小さくしました',
      '「前回の続きを開きました」などのお知らせは、タップするとすぐ消えます',
      'プレゼンテーションモードを始めても勝手に再生せず、再生位置を 0 拍目に戻すだけにしました。ブロックも薄くなりません',
    ],
    en: [
      'The Night Mode text is smaller.',
      'Notices such as "Opened where you left off" now disappear when you tap them.',
      'Starting presentation mode no longer starts playback. It just moves the playback position to beat 0, and blocks are no longer dimmed.',
    ],
  },
  {
    v: '1.7.2', date: '2026-11-11',
    ja: ['左右の端の移動ボタンを、画面の端ぎりぎりに寄せました。0 拍目に戻るボタンで、再生位置も 0 拍目になります'],
    en: ['The move buttons now sit right at the screen edges. The back-to-beat-0 button also moves the playback position to beat 0.'],
  },
  {
    v: '1.7.1', date: '2026-11-11',
    ja: ['プレイモードのボタンの丸は、いつもはトラックの真ん中に並べ、同じ拍に違うボタンがあるときだけ縦に並べるようにしました'],
    en: ['In play mode, button circles now line up in the middle of the tracks, and stack vertically only when different buttons share the same beat.'],
  },
  {
    v: '1.6.0', date: '2026-11-11',
    ja: [
      'プレイアロングで、違うボタンを同時に押すキュー（A と十字の左など）が両方とも判定されるようになりました',
      'メトロノームの音を RHRE fresh と同じカウベルにしました。メトロノームを入れている間は Play-Yan が跳ねます',
      'トラックの左右の端に、速く移動するボタンと 0 拍目に戻るボタンを付けました',
    ],
    en: [
      'In Playalong, cues for different buttons at the same time (such as A and D-pad left) are now both judged.',
      'The metronome now uses the same cowbell as RHRE fresh, and Play-Yan jumps while it is on.',
      'Added buttons at the left and right edges of the tracks to move quickly and to go back to beat 0.',
    ],
  },
];
