import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
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

    // dotted globe
    const geometry = new THREE.SphereGeometry(1, 64, 64)
    const positions = geometry.attributes.position
    const dotGeo = new THREE.BufferGeometry()
    const dotPositions = []

    for (let i = 0; i < positions.count; i += 2) {
      dotPositions.push(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      )
    }

    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3))

    const dotMat = new THREE.PointsMaterial({
      color: 0xa78bfa,
      size: 0.015,
      transparent: true,
      opacity: 0.8,
    })

    const dots = new THREE.Points(dotGeo, dotMat)
    scene.add(dots)

    // subtle equator ring
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
        border: "1px solid rgba(167, 139, 250, 0.4)",
        width: 300,
        height: 300,
      }}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 2.5, opacity: 0 }}
      transition={{ duration: 2.5, delay, repeat: Infinity, ease: "easeOut" }}
    />
  )
}

export default function LandingScreen({ onEnter }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#0f0f1a",
      gap: "2rem",
      overflow: "hidden",
    }}>
      {/* ripples + globe */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ripple delay={0} />
        <Ripple delay={0.8} />
        <Ripple delay={1.6} />
        <GlobeCanvas />
      </div>

      {/* title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ textAlign: "center" }}
      >
        <h1 style={{ fontSize: "2.5rem", color: "#a78bfa", fontWeight: 700 }}>wavelength</h1>
        <p style={{ color: "#666", marginTop: "0.5rem" }}>find your people nearby</p>
      </motion.div>

      {/* CTA */}
      <AnimatePresence>
        {ready && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={onEnter}
            style={{
              padding: "0.9rem 2.5rem",
              background: "#a78bfa",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            find my wavelength →
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}