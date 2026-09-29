# AWAKEN — Squat Training

Этап 2: webcam → MediaPipe landmarks → Squat Detector → Rep Counter + Error Mode.

Реализованы камера, скелет, распознавание приседаний, счётчик корректных повторений
и подсказки по глубине, коленям, корпусу и выпрямлению. Остальная игровая логика остаётся на следующих этапах.

**Этап 2:** [полный код, интеграция, thresholds, тесты и ограничения](SQUAT_DETECTOR.md).
Новых npm-зависимостей для него не требуется. После запуска встань лицом к камере,
покажи плечи, таз, колени и лодыжки, затем постой прямо примерно секунду для калибровки.

Исправлен случай, когда скелет движется, а фаза остаётся `standing`: кроме 3D-углов
детектор проверяет опускание таза и сгибание обеих ног в изображении. Расстояния
нормализованы относительно ширины плеч и исходной стойки. В DEBUG METRICS добавлен
`Hip drop (camera)`. Повторный hold после зачёта больше не требуется.

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
  hooks/useSquatExercise.ts
  exercise-engine/
    angles.ts
    types.ts
    squatDetector.ts
  components/
    Camera/CameraView.tsx
    Camera/CameraView.css
    PoseOverlay/PoseOverlay.tsx
    ExerciseFeedback/ExerciseFeedback.tsx
    ExerciseFeedback/ExerciseFeedback.css
  tests/usePoseDetection.test.tsx
  tests/squatDetector.test.ts
  tests/useSquatExercise.test.tsx
  tests/ExerciseFeedback.test.tsx
  tests/fixtures/squatFrames.ts
README.md
IMPLEMENTATION.md              # архив кода этапа 1
SQUAT_DETECTOR.md              # полный код этапа 2
```

## 3. Как работает

`usePoseDetection(videoRef, enabled, restartKey)` владеет камерой, моделью и detection loop.
Возвращает `landmarks`, `worldLandmarks`, `poseTimestampMs`, `isLoading`, `error`, `isPersonDetected`, состояния камеры/движка
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

`useSquatExercise` передаёт каждый новый кадр в один экземпляр `SquatDetector`.
3D world landmarks используются для углов и относительных расстояний, а normalized
landmarks — для проверки видимости и границ кадра. Полный цикл стоя → вниз → низ → вверх → стоя
даёт один реп при выполнении порогов. Ошибки техники, подтверждённые в течение 180 мс,
запоминаются до конца попытки. Потеря трекинга отменяет попытку и требует повторной калибровки;
накопленный счётчик сохраняется до нажатия «СБРОСИТЬ СЧЁТЧИК» или перезагрузки страницы.

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

Для проверки приседаний дождись калибровки и сделай три полных приседа с короткой
паузой стоя между ними. Счётчик должен стать 3. Затем проверь мелкий присед,
сведение коленей, сильный наклон корпуса и остановку на полуподъёме.
Подробная матрица сценариев находится в [SQUAT_DETECTOR.md](SQUAT_DETECTOR.md).

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
- Автоматические тесты охватывают lifecycle камеры, копирование world landmarks,
  геометрию, четыре фазы приседа, ошибки техники, неполное выпрямление, debounce,
  cooldown, потерю трекинга, масштаб тела, StrictMode hook и панель feedback.
- Проверено наличие модели и WASM в production output.
- Тесты камеры используют подмены browser/MediaPipe API, а тесты движений — синтетические
  последовательности суставов. Они проверяют алгоритм, но не точность модели на реальных людях.
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

`main` — защищённая ветка по правилу пользователя. Каждая задача выполняется
в отдельной `feature/`-ветке. Перед новой задачей при чистой рабочей копии:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/<название-задачи>
```

После реализации:

```bash
git status
git add .
git commit -m "feat: implement squat detection state machine"
git push -u origin feature/<название-задачи>
```

Перед каждым изменением кода проверяй `git branch --show-current`: в `main`
файлы изменять нельзя. Перед push проверяй обновления коллабораторов через `git fetch origin`.
После push feature-ветки работа агента заканчивается. Пользователь сам создаёт Pull Request
и выполняет merge; агент не мержит и не отправляет изменения напрямую в `main`.

Альтернатива — три отдельных коммита:

1. `feat: implement squat detection state machine` — геометрия, конфиг, FSM, проверки движений.
2. `feat: connect squat detector to training UI` — world landmarks, hook, feedback, интеграционные тесты.
3. `docs: document squat calibration and validation` — запуск, настройка, проверки, полный код.

## Официальные источники

- [MediaPipe Pose Landmarker для Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Vite — Getting Started](https://vite.dev/guide/)

Следующий этап сможет использовать `repJustCounted`, `formStatus` и `errorCode` для игровой логики.
