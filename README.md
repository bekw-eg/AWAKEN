# AWAKEN - BY DUO DEVS

Браузерная fitness-RPG: выполняйте упражнения перед веб-камерой, развивайте персонажа и сражайтесь с противниками. MediaPipe обрабатывает видео на устройстве; корректные повторения превращаются в опыт и боевой урон.

## Features

- Webcam-based exercise tracking и подсказки по технике
- Squats, Push-ups, Jumping Jacks
- Тренировки, опыт, уровни и локальное сохранение прогресса
- RPG battle system: 9 противников и boss fight
- Выбор атак движением тела и восстановление HP
- Урон за корректное повторение: Jumping Jack — 2, Squat — 5, Push-up — 10

## Tech Stack

React · TypeScript · Vite · MediaPipe Pose Landmarker · Feather Icons · Vitest

## Run locally

Node.js 22.12+ и веб-камера. Первая установка скачивает модель MediaPipe, поэтому нужен интернет.

```bash
npm install
npm run dev
```

## Build

```bash
npm test
npm run build
npm run preview
```

Разместите содержимое `dist/` на статическом HTTPS-хостинге, включая `mediapipe/`. Для размещения в подпапке задайте её при сборке: `npm run build -- --base=/AWAKEN/`. Секреты и environment variables не требуются; камера работает на HTTPS или localhost.

## How it works

В Training выберите упражнение. В бою выберите атаку движением, дождитесь GO и выполняйте корректные повторения в течение 30 секунд — накопленный урон применяется один раз в конце подхода. Для приседаний и Jumping Jacks встаньте лицом к камере, для отжиманий — боком; держите нужные суставы в кадре.
