import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import * as THREE from "three"

function SpaceCanvas() {
  const mountRef = useRef(null)

  useEffect(() => {
    const w = window.innerWidth
    const h = window.innerHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    mountRef.current.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000)

    camera.position.z = 3
    camera.position.y = -0.5

    // STARS
    const starGeo = new THREE.BufferGeometry()
    const starCount = 1500
    const starPositions = []
    const starColors = []
    const palette = [
      new THREE.Color(0xfef3f2),
      new THREE.Color(0xc4b5fd),
      new THREE.Color(0xfda4af),
      new THREE.Color(0xfcd34d),
    ]

    for (let i = 0; i < starCount; i++) {
      starPositions.push(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 50 - 10
      )
      const c = palette[Math.floor(Math.random() * palette.length)]
      starColors.push(c.r, c.g, c.b)
    }

    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3))
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3))
    const starMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.85 })
    const stars = new THREE.Points(starGeo, starMat)
    scene.add(stars)

    // GLOBE (dotted)
    const globeGeo = new THREE.SphereGeometry(1, 64, 64)
    const positions = globeGeo.attributes.position
    const dotGeo = new THREE.BufferGeometry()
    const dotPositions = []
    for (let i = 0; i < positions.count; i += 2) {
      dotPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i))
    }
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3))
    const dotMat = new THREE.PointsMaterial({
      color: 0xc4b5fd,
      size: 0.018,
      transparent: true,
      opacity: 0.9,
    })
    const dots = new THREE.Points(dotGeo, dotMat)
    scene.add(dots)

    // GLOW layers around globe
    const glowLayers = [
      { scale: 1.15, color: 0xc4b5fd, opacity: 0.08 },
      { scale: 1.3,  color: 0xfda4af, opacity: 0.05 },
      { scale: 1.5,  color: 0xc4b5fd, opacity: 0.03 },
    ]
    glowLayers.forEach(({ scale, color, opacity }) => {
      const g = new THREE.SphereGeometry(scale, 32, 32)
      const m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.BackSide,
      })
      scene.add(new THREE.Mesh(g, m))
    })

    // EQUATOR RING
    const ringGeo = new THREE.TorusGeometry(1, 0.003, 16, 100)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfda4af, transparent: true, opacity: 0.3 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    scene.add(ring)

    let frame
    const animate = () => {
      frame = requestAnimationFrame(animate)
      dots.rotation.y += 0.003
      ring.rotation.z += 0.003
      stars.rotation.y += 0.0003
      stars.rotation.x += 0.0001
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      renderer.dispose()
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  )
}

function Ripple({ delay }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        borderRadius: "50%",
        border: "1px solid rgba(196, 181, 253, 0.25)",
        width: 300,
        height: 300,
        pointerEvents: "none",
      }}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 2.5, opacity: 0 }}
      transition={{ duration: 2.5, delay, repeat: Infinity, ease: "easeOut" }}
    />
  )
}

export default function LandingScreen({ onEnter }) {
  return (
  <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    height: "100vh",
    background: "var(--bg)",
    overflow: "hidden",
    position: "relative",
    padding: "3rem 2rem",
  }}>
    <SpaceCanvas />

    {/* globe at top */}
    <div style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      zIndex: 1,
      width: 260,
      height: 260,
    }}>
      <Ripple delay={0} />
      <Ripple delay={1} />
      <Ripple delay={2} />
    </div>

    {/* text and button at bottom */}
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      style={{ textAlign: "center", zIndex: 1, position: "relative", width: "100%" }}
    >
      <h1 style={{
        fontSize: "2.75rem",
        fontWeight: 800,
        background: "linear-gradient(160deg, #fde8d8 0%, #fda4af 50%, #c4b5fd 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        lineHeight: 1.1,
        marginBottom: "1rem",
        letterSpacing: "-0.02em",
      }}>
        wavelength
      </h1>

      <p style={{
        color: "rgba(253, 232, 216, 0.6)",
        fontSize: "0.95rem",
        lineHeight: 1.8,
        maxWidth: "260px",
        margin: "0 auto 2rem",
      }}>
        somewhere nearby, someone feels exactly what you feel.
      </p>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={onEnter}
        style={{
          padding: "0.9rem 2.5rem",
          background: "linear-gradient(135deg, #fda4af, #c4b5fd)",
          color: "#0d0b1a",
          border: "none",
          borderRadius: "999px",
          fontSize: "0.95rem",
          fontWeight: 700,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          cursor: "pointer",
          boxShadow: "0 0 30px rgba(253, 164, 175, 0.25)",
        }}
      >
        find my wavelength →
      </motion.button>
    </motion.div>
  </div>
  )
}
