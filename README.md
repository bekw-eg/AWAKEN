# AWAKEN — Camera System

Этап 1: webcam → MediaPipe Pose Landmarker → landmarks → canvas skeleton.

Реализованы камера, распознавание одной позы, скелет, состояния загрузки, ошибки,
остановка и повторный запуск. Упражнения, Error Mode и игровая логика относятся к следующим этапам.

## 1. Пакеты и установка

Нужен Node.js 22.12+ (проверено на 22.22.2) и браузер с webcam API.

Для этого готового проекта:

```bash
npm ci
npm run dev
```

Открой адрес из терминала: обычно http://127.0.0.1:5173/.
Если PowerShell блокирует `npm.ps1`, используй `npm.cmd` вместо `npm`.

Зависимости приложения: `react`, `react-dom`, `@mediapipe/tasks-vision`.
Инструменты сборки: `vite`, `typescript`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.
Тесты: `vitest`, `jsdom`, `@testing-library/react`.
Точные версии зафиксированы в `package.json` и `package-lock.json`.

Эквивалентные команды для установки в новый проект:

```bash
npm install --save-exact react react-dom @mediapipe/tasks-vision
npm install -D --save-exact vite typescript @vitejs/plugin-react @types/react @types/react-dom vitest jsdom @testing-library/react
```

При установке `postinstall` копирует WASM из установленной версии пакета и скачивает
официальную модель Pose Landmarker Lite. Для первой установки нужен интернет.
При `dev` и `build` подготовка проверяется ещё раз; имеющаяся модель повторно не скачивается.

## 2. Структура

```text
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
scripts/
  prepare-assets.mjs
public/mediapipe/              # создаётся автоматически, исключено из Git
  pose_landmarker_lite.task
  wasm/
src/
  main.tsx
  App.tsx
  types/pose.ts
  hooks/usePoseDetection.ts
  components/
    Camera/CameraView.tsx
    Camera/CameraView.css
    PoseOverlay/PoseOverlay.tsx
  tests/usePoseDetection.test.tsx
README.md
IMPLEMENTATION.md              # полный код файлов с путями
```

## 3. Как работает

`usePoseDetection(videoRef, enabled, restartKey)` владеет камерой, моделью и detection loop.
Возвращает `landmarks`, `isLoading`, `error`, `isPersonDetected`, состояния камеры/движка
и фактический размер видео. Координаты landmarks остаются исходными, без зеркального преобразования.

- Камера: ideal 1280×720, `facingMode: user`, без аудио.
- Модель: `VIDEO`, `numPoses: 1`, CPU delegate, Lite; segmentation masks отключены.
- Вычисления ограничены 20 запусками в секунду, один запуск на новый `video.currentTime`.
  Это верхняя граница, не обещание 20 FPS на любом компьютере.
- Единственный `requestAnimationFrame` назначается после синхронного `detectForVideo`.
- Во время скрытой вкладки вычисления пропускаются, старые landmarks очищаются.
- На каждый результат вызывается `close()`. Landmarks копируются до освобождения результата.
- В StrictMode первый отложенный запуск отменяется cleanup. Retry ждёт предыдущую
  незавершённую инициализацию; устаревшие результаты закрываются до нового запуска.
- Cleanup отменяет таймер и RAF, удаляет listeners, прерывает ожидание видео,
  останавливает tracks, очищает `srcObject` и закрывает модель. `pagehide` также освобождает ресурсы.
- `getUserMedia` и создание модели не имеют API отмены. Если они завершаются после cleanup,
  полученный stream немедленно останавливается, модель немедленно закрывается.
- Если видео не готово за 15 секунд, камера останавливается с сообщением об ошибке.

`PoseOverlay` рисует стандартные `POSE_CONNECTIONS` и точки с visibility ≥ 0.5.
Видео и canvas находятся в общем зеркальном контейнере; bitmap canvas имеет реальные
`videoWidth`/`videoHeight`, а контейнер сохраняет их aspect ratio. Это исключает разные
зеркальные преобразования и обрезку изображения в двух слоях.

Цвета отдельных элементов можно изменить через `jointColor(index)` и
`connectionColor(start, end)`. Здесь это только расширяемый интерфейс отрисовки.

Все модели, WASM, JavaScript и стили обслуживаются с адреса приложения.
Видео, кадры и landmarks не отправляются в сеть и не сохраняются.

## 4. Как проверить MediaPipe

1. Открой страницу и разреши доступ к камере.
2. Дождись `Camera: active` и `Pose Engine: active`.
3. Встань перед камерой при хорошем освещении, целиком в кадре.
4. Должны появиться `POSE DETECTED`, cyan-соединения и белые точки.
5. Подвигай руками и ногами: линии должны следовать за телом без смещения относительно видео.
6. Выйди из кадра: canvas должен очиститься, статус смениться на `SEARCHING FOR USER…`.
7. Нажми `STOP CAMERA`: изображение и скелет исчезают, индикатор камеры браузера выключается.
8. Нажми `START CAMERA`: должен появиться один поток и один движущийся скелет.
9. Повтори stop/start несколько раз; закрой страницу и проверь индикатор камеры.
10. Проверь отказ в доступе, отключённую webcam и изменение размера окна.

В DevTools → Network модель `.task` и выбранные `.wasm`/`.js` файлы должны возвращаться
с кодом 200. В Console не должно быть необработанных ошибок. Повторяющихся запросов
модели в каждом кадре быть не должно.

Проверка production:

```bash
npm test
npm run build
npm run preview
```

`dist/` содержит приложение, модель и WASM. Для публикации необходим HTTPS.
HTTP localhost/127.0.0.1 подходит для локальной разработки; обычный HTTP по LAN IP
может не предоставлять доступ к webcam.

### Выполненные проверки

- TypeScript и production build проходят.
- 18 unit-тестов проходят: StrictMode, поздние camera/model promises, retry,
  throttle и новые кадры, пропадание человека, ошибки камеры/модели/inference,
  ожидание видео, mute/hidden, pagehide, stop/start и cleanup.
- Проверено наличие модели и WASM в production output.
- Тесты используют подмены browser/MediaPipe API. Они проверяют lifecycle, а не точность модели.
- Проверка в браузере с настоящей камерой остаётся ручной: инструмент браузера
  сообщил об отказе в разрешении открыть локальную страницу.

## 5. Возможные ошибки

| Сообщение | Что проверить |
|---|---|
| `CAMERA ACCESS REQUIRED` | Разрешение на камеру в настройках сайта и ОС; затем Retry. |
| `NO CAMERA FOUND` | Подключение webcam и её наличие в системе. |
| `CAMERA UNAVAILABLE` | Камера занята другим приложением или недоступна ОС. |
| `CAMERA NOT SUPPORTED` | HTTPS/localhost и поддержка `mediaDevices.getUserMedia`. |
| `CAMERA DISCONNECTED` | Подключить камеру и нажать Retry. |
| `CAMERA COULD NOT START` | Нет кадров, проблема воспроизведения или разрешений. |
| `POSE ENGINE COULD NOT LOAD` | Выполнить `npm run prepare:assets`, проверить Network, обновить браузер. |
| `POSE DETECTION STOPPED` | Перезапустить движок кнопкой Retry; проверить Console и браузер. |
| `SEARCHING FOR USER…` | Улучшить свет, показать всё тело, убрать препятствия перед камерой. |

Если установка модели не удалась из-за сети, после восстановления доступа выполни:

```bash
npm run prepare:assets
```

Для более слабого компьютера можно снизить `FRAME_INTERVAL`-частоту, увеличив интервал
в hook. `detectForVideo` синхронный и работает на основном потоке; Web Worker остаётся
вариантом дальнейшей оптимизации после измерений на целевых устройствах.

## 6. Git-инструкции

В текущей папке исходно не было `.git`. Коммиты и push автоматически не выполнялись.

Если работаешь в существующем клоне с настроенным `origin` и веткой `main`, перед работой:

```bash
git checkout main
git pull
git checkout -b feature/pose-detection
```

После реализации:

```bash
git add .
git commit -m "feat: integrate webcam pose detection"
git push -u origin feature/pose-detection
```

Для этой новой папки сначала можно выполнить `git init -b main`, затем
`git checkout -b feature/pose-detection`. Перед push добавь свой remote:
`git remote add origin <URL_РЕПОЗИТОРИЯ>`. Это подходит для нового пустого remote;
если remote уже содержит историю, сначала клонируй его и перенеси файлы проекта.

Альтернатива — три отдельных коммита:

1. `chore: scaffold React TypeScript Vite app` — конфигурация, зависимости, entry points.
2. `feat: add webcam pose tracking and skeleton overlay` — hook, assets, типы, камера и overlay.
3. `test: cover pose lifecycle and document setup` — тесты и документация.

## Официальные источники

- [MediaPipe Pose Landmarker для Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Vite — Getting Started](https://vite.dev/guide/)

Следующий этап сможет использовать `landmarks` как вход Exercise Engine.
