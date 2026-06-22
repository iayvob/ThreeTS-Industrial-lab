# ThreeJS-CNC — Browser CNC Simulator

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-0.160+-black.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.2+-white.svg)

## 🌟 Why This Matters

**Transform expensive hardware training into accessible web-based simulation.**

This project bridges the gap between theoretical knowledge and hands-on experience with industrial CNC machines and robotic systems. By moving from traditional desktop applications to a modern web-based framework, we've made advanced manufacturing simulation:

- **Accessible Anywhere** — Run in any modern browser without software installation
- **Cost-Effective** — No expensive hardware or licenses required for training
- **Safe Learning** — Practice machine operations and robot programming without risk
- **Collaborative** — Share simulations and train teams remotely
- **Future-Ready** — Built on modern web standards for long-term maintainability

The transition to **Three.js** enables hardware-accelerated 3D graphics that reach worldwide users instantly through the web—something traditional desktop GUI applications cannot achieve.

## 👥 Collaborators

This project thrives on community contributions. We welcome developers, researchers, students, and manufacturing professionals to join in making industrial simulation accessible to everyone.

### Active Contributors

- **Project Lead** — Architectural design and core simulation engine
- **3D Visualization Team** — Three.js scene optimization and rendering
- **Kinematics Specialists** — DH parameter implementation and URDF parsing
- **UI/UX Designers** — User interface and interaction design
- **Testers & Documenters** — Quality assurance and documentation

### Want to Become a Contributor?

See our [Contributing Guidelines](#-contributing) section below. Whether you're fixing bugs, adding features, improving documentation, or sharing ideas, we value every contribution!

## Overview

ThreeJS-CNC provides a client-rendered digital twin of a CNC/laser machine (UNIVERSAL VLS6.60) with a UR5 robot arm. Features include interactive controls, real-time vibration monitoring, kinematics simulation, and high-fidelity 3D visualization with proper memory management.

## Key Features

- **Interactive 3D Scene** — Three.js powered visualization with orbit controls, real-time labels, and efficient STL loading (~220 MB of geometry)
- **Machine Kinematics** — DH parameter and URDF parsing implemented in TypeScript for accurate CNC machine simulation
- **UR5 Robot Integration** — 6-axis industrial robot with inverse kinematics, TCP tracking, and gripper control
- **Real-time Monitoring** — Vibration sensor with live charting and status indicators (normal/warning/danger)
- **Responsive UI** — Mobile-optimized drawer and control panel built with Tailwind CSS
- **Memory-Optimized** — Comprehensive resource disposal and React StrictMode protection prevents memory leaks
- **Type-Safe** — Strict TypeScript configuration with full type coverage

## Quick Start

Clone the repo and install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

Build for production:

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with font configuration
│   ├── page.tsx           # Home page (DigitalTwinPage)
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── DigitalTwinPage.tsx    # Main application container
│   ├── ThreeScene.tsx         # Three.js scene setup and rendering
│   ├── SidebarPanel.tsx       # Control panel with CNC/UR5 tabs
│   ├── StatusHud.tsx          # Status overlay display
│   ├── VibrationChart.tsx     # Real-time vibration charting
│   └── ui/                     # Reusable UI components
└── lib/
    ├── machine/            # Machine simulation logic
    │   ├── machineState.ts     # VLS6.60 machine state management
    │   ├── ur5State.ts         # UR5 robot state and kinematics
    │   ├── kinematicChain.ts   # Kinematic chain implementation
    │   ├── stlLoader.ts        # STL file loader with caching
    │   ├── urdfParser.ts      # URDF XML parser
    │   ├── dhCalculator.ts     # DH parameter calculator
    │   └── memoryDiagnostics.ts # Memory monitoring tools
    └── utils.ts            # Utility functions
```

## Development Notes

- **UI source**: [src/app](src/app)
- **Three.js scene**: [src/components/ThreeScene.tsx](src/components/ThreeScene.tsx)
- **Machine simulation**: [src/lib/machine](src/lib/machine)
- **Expected memory usage**: ~300-400 MB during operation (normal for 220 MB of 3D geometry)

### Memory Management

This application implements comprehensive memory management:

- ✅ Proper Three.js resource disposal (geometries, materials, textures)
- ✅ React StrictMode protection against double-mounting
- ✅ Efficient circular buffer for vibration data
- ✅ Object reuse in animation loops (raycaster, vectors)
- ✅ Cleanup functions in all useEffect hooks

See [MEMORY_AUDIT_REPORT.md](MEMORY_AUDIT_REPORT.md) for detailed analysis.

### Useful Scripts

- `npm run dev` — start Next.js dev server
- `npm run build` — production build
- `npm run lint` — run ESLint on `src`
- `npx tsc --noEmit` — TypeScript type-check

## Machine Controls

### CNC Machine (VLS6.60)

- **Power** — Toggle machine on/off
- **Mode** — Manual / Automatic / Maintenance
- **Door** — Open/close with safety interlock
- **Axes** — X-axis (0-1718mm) and Y-axis (0-1451mm) positioning
- **Laser** — Power control (0-100%)
- **E-Stop** — Emergency stop with immediate state reset

### UR5 Robot

- **Joint Control** — 6-axis joint angle adjustment
- **Gripper** — Open/close control with percentage display
- **TCP Tracking** — Real-time tool center point coordinates
- **Reset View** — Camera reset to optimal viewing angle

## Technical Stack

- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript (strict mode)
- **3D Graphics**: Three.js
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with shadcn/ui patterns
- **Build Tool**: Turbopack (Next.js)
- **Linting**: ESLint with TypeScript rules

## Performance Considerations

- **STL Loading**: ~220 MB of geometry data loaded asynchronously with progress indicators
- **Animation Loop**: 60 FPS with optimized object reuse
- **Vibration Sampling**: 10 Hz update rate with circular buffer
- **Memory**: Automatic cleanup on unmount prevents leaks

## Security / Vulnerabilities

Automated scans may report moderate vulnerabilities from nested `postcss` dependencies in Next.js. These are transitive (under `next/node_modules`) and require updating Next.js to resolve. Options:

- Upgrade `next` to a release with patched `postcss`
- Run `npm audit fix --force` (may introduce breaking changes)

**Current status**: `npm run build`, `npx tsc --noEmit`, and `npx eslint src --ext .ts,.tsx` all pass.

## 🤝 Contributing

We welcome contributions from developers, students, and researchers! Here's how you can help:

### For Developers

- **Bug fixes** — Check [Issues](../../issues) for reported bugs
- **Features** — Open an issue to discuss major changes before submitting PR
- **Documentation** — Improve code comments, examples, or this README
- **Tests** — Add test coverage for machine simulation logic

### For Researchers & Students

- **Kinematics** — Extend robot inverse kinematics algorithms
- **Sensors** — Add more realistic sensor simulations (temperature, current)
- **Path Planning** — Implement automated CNC path generation
- **Visualization** — Enhance 3D rendering and user interface

### Contribution Workflow

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow existing TypeScript patterns and naming conventions
- Add comments for complex kinematics calculations
- Update README when adding new features
- Test memory usage before submitting (see [Memory Management](#memory-management))

### Questions?

Open an issue with the `question` label, and we'll help you get started!

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

### MIT License Summary

✅ **Permitted Use**

- Commercial use
- Modification
- Distribution
- Private use

⚠️ **Requirements**

- Include the license and copyright notice in copies or substantial portions

❌ **Limitations**

- Warranty is disclaimed
- Liability is disclaimed

### What This Means For You

- **Companies** — Integrate into commercial products without complex licensing
- **Students** — Use freely in projects, research, and portfolios
- **Educators** — Modify and distribute for teaching purposes
- **Contributors** — Your contributions remain under the same permissive license

For the full legal text, see [LICENSE](LICENSE).
