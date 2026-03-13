import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import * as THREE from "three"

function GlobeCanvas() {
  const mountRef = useRef(null)

  useEffect(() => {
    const w = mountRef.current.clientWidth
    const h = mountRef.current.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    mountRef.current.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
    camera.position.z = 2.5

    const geometry = new THREE.SphereGeometry(1, 64, 64)
    const positions = geometry.attributes.position
    const dotGeo = new THREE.BufferGeometry()
    const dotPositions = []

    for (let i = 0; i < positions.count; i += 2) {
      dotPositions.push(positions.getX(i), positions.getY(i), positions.getZ(i))
    }

    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3))

    const dotMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.015,
      transparent: true,
      opacity: 0.8,
    })

    const dots = new THREE.Points(dotGeo, dotMat)
    scene.add(dots)

    const ringGeo = new THREE.TorusGeometry(1, 0.003, 16, 100)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.2 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    scene.add(ring)

    let frame
    const animate = () => {
      frame = requestAnimationFrame(animate)
      dots.rotation.y += 0.003
      ring.rotation.z += 0.003
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      renderer.dispose()
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ width: "300px", height: "300px" }} />
}

function Ripple({ delay }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        borderRadius: "50%",
        border: "1px solid rgba(56, 189, 248, 0.3)",
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
      justifyContent: "center",
      height: "100vh",
      background: "var(--bg)",
      gap: "2rem",
      overflow: "hidden",
      position: "relative",
    }}>

      <div style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}>
        <Ripple delay={0} />
        <Ripple delay={0.8} />
        <Ripple delay={1.6} />
        <GlobeCanvas />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{ textAlign: "center" }}
      >
        <h1 style={{ fontSize: "2.5rem", color: "var(--purple)", fontWeight: 700 }}>wavelength</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>Find your people nearby</p>
      </motion.div>

      <button
        onClick={onEnter}
        style={{
          padding: "0.9rem 2.5rem",
          background: "var(--purple)",
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          fontSize: "1rem",
          fontWeight: 600,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          cursor: "pointer",
          position: "relative",
          zIndex: 10,
        }}
      >
        find my wavelength →
      </button>
    </div>
  )
}