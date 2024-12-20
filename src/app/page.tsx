"use client"
import React, { useEffect, useRef } from "react";
import Head from "next/head";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Generates a random integer between x1 and x2 (inclusive)
function randomInteger(x1: number, x2: number): number {
  return Math.round(Math.random() * (x2 - x1) + x1);
}

// Pipe Class: Represents a single pipe structure that grows within the scene
class Pipe {
  currentPosition: THREE.Vector3; // The current position of the pipe's endpoint
  material!: THREE.Material;      // Material used for the pipe's geometry
  object3D: THREE.Object3D;       // Group containing all the pipe's segments and joints
  lastDirection: THREE.Vector3 | null = null; // Tracks the last growth direction to avoid backtracking

  constructor(
    scene: THREE.Scene,
    setLocationOccupied: (pos: THREE.Vector3) => void,
    gridBounds: THREE.Box3
  ) {
    // Generate a random initial position within gridBounds
    const randomX = randomInteger(gridBounds.min.x, gridBounds.max.x);
    const randomY = randomInteger(gridBounds.min.y, gridBounds.max.y);
    const randomZ = randomInteger(gridBounds.min.z, gridBounds.max.z);
    this.currentPosition = new THREE.Vector3(randomX, randomY, randomZ);

    // Create a 3D object group for the pipe and add it to the scene
    this.object3D = new THREE.Object3D();
    scene.add(this.object3D);

    // Create a random material color for this pipe
    const color = randomInteger(0, 0xffffff);
    const emissive = new THREE.Color(color).multiplyScalar(0.3);
    this.material = new THREE.MeshPhongMaterial({
      specular: 0xa9fcff,
      color: color,
      emissive: emissive,
      shininess: 100,
    });

    // Add the starting joint to the pipe and mark the position as occupied
    this.createJoint(this.currentPosition);
    setLocationOccupied(this.currentPosition);
  }

  // Creates a spherical joint at the given position
  createJoint(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(position);
    this.object3D.add(mesh);
  }

  // Creates a cylindrical segment between two points
  createSegment(from: THREE.Vector3, to: THREE.Vector3) {
    const delta = new THREE.Vector3().subVectors(to, from);
    const length = delta.length();
    const geometry = new THREE.CylinderGeometry(0.15, 0.15, length, 16);

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.addVectors(from, delta.clone().multiplyScalar(0.5));
    mesh.lookAt(to);           // Aligns the segment to point towards its destination
    mesh.rotateX(Math.PI / 2); // Adjusts orientation to match cylinder's default alignment
    this.object3D.add(mesh);
  }

  // Attempts to grow the pipe in a random direction, returns true if successful
  update(
    gridBounds: THREE.Box3,
    setLocationOccupied: (pos: THREE.Vector3) => void,
    isLocationOccupied: (pos: THREE.Vector3) => boolean
  ): boolean {
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    // Filter out the last direction to avoid backtracking
    const validDirections = directions.filter(
      (dir) => !this.lastDirection || !dir.equals(this.lastDirection)
    );

    // Randomize the direction order
    const shuffledDirections = validDirections.sort(() => Math.random() - 0.5);

    // Try each direction in random order
    for (const direction of shuffledDirections) {
      const segmentLength = Math.floor(Math.random() * 10) + 1; // Random segment length
      const scaledDirection = direction.clone().multiplyScalar(segmentLength);
      const newPosition = this.currentPosition.clone().add(scaledDirection);

      // Check if the path is valid
      if (!this.isPathValid(this.currentPosition, scaledDirection, gridBounds, isLocationOccupied))
        continue;

      // Reserve the path, create the segment and joint
      this.reservePath(this.currentPosition, scaledDirection, setLocationOccupied);
      this.createSegment(this.currentPosition, newPosition);
      this.createJoint(newPosition);

      setLocationOccupied(newPosition);   // Mark the endpoint as occupied
      this.currentPosition = newPosition; // Update the pipe's endpoint
      this.lastDirection = direction;     // Update the last growth direction

      return true; // Growth occurred
    }

    return false; // No growth possible
  }

  // Checks if a proposed path is valid (unoccupied and within bounds)
  isPathValid(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    gridBounds: THREE.Box3,
    isLocationOccupied: (pos: THREE.Vector3) => boolean
  ): boolean {
    const steps = Math.abs(direction.x || direction.y || direction.z); // Path length
    const stepVector = direction.clone().normalize(); // Unit step vector

    // Check each intermediate point along the path
    for (let i = 1; i <= steps; i++) {
      const intermediate = start.clone().add(stepVector.clone().multiplyScalar(i));
      if (isLocationOccupied(intermediate) || !gridBounds.containsPoint(intermediate)) {
        return false; // Path is invalid
      }
    }

    return true; // Path is valid
  }

  // Reserves a path by marking intermediate points as occupied
  reservePath(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    setLocationOccupied: (pos: THREE.Vector3) => void
  ) {
    const steps = Math.abs(direction.x || direction.y || direction.z);
    const stepVector = direction.clone().normalize();

    for (let i = 1; i <= steps; i++) {
      const intermediate = start.clone().add(stepVector.clone().multiplyScalar(i));
      setLocationOccupied(intermediate);
    }
  }
}

// Main Component: Renders the 3D pipes animation
const PipesPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const numOfPipes = 5; // Control how many pipes should be created

  const boxSize = 10;   // Control the dimension of the 3D Cube the pipes are bound by

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the 3D scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.set(20, 20, 20);

    // Initialize WebGL renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000); // Set background color
    containerRef.current.appendChild(renderer.domElement);

    // Add orbit controls for user interaction
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    // Add ambient and directional lighting
    scene.add(new THREE.AmbientLight(0x111111));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(-1.2, 1.5, 0.5);
    scene.add(directionalLight);

    // Define the grid boundaries, this is the 3D Cube grid upon which the
    // pipes should be rendered within
    const gridBounds = new THREE.Box3(
      new THREE.Vector3(-boxSize, -boxSize, -boxSize),
      new THREE.Vector3(boxSize, boxSize, boxSize)
    );

    // Track which positions on the grid are occupied by some segment of a pipe
    const nodes: Record<string, number> = {};

    // Marks a position on the grid as occupied
    const setLocationOccupied = (position: THREE.Vector3) => {
      const key = `${Math.round(position.x)},${Math.round(position.y)},${Math.round(position.z)}`;
      nodes[key] = 1; // Mark the location as occupied
    };

    // Checks if a position on the grid is occupied
    const isLocationOccupied = (position: THREE.Vector3): boolean => {
      const key = `${Math.round(position.x)},${Math.round(position.y)},${Math.round(position.z)}`;
      return nodes[key] === 1; // Return true if occupied, false otherwise
    };

    // Create multiple pipes
    const pipes: Pipe[] = [];
    for (let i = 0; i < numOfPipes; i++) {
      pipes.push(new Pipe(scene, setLocationOccupied, gridBounds));
    }

    // Reset the scene after inactivity
    let idleTime = 0;
    const resetScene = () => {
      pipes.forEach((pipe) => scene.remove(pipe.object3D));
      pipes.length = 0;
      Object.keys(nodes).forEach((key) => delete nodes[key]);
      for (let i = 0; i < numOfPipes; i++) {
        pipes.push(new Pipe(scene, setLocationOccupied, gridBounds));
      }
      idleTime = 0;
      console.log("Scene reset!");
    };

    // Animation loop
    const animate = () => {
      let pipesUpdated = false; // Set to true if any pipe has grown during the last animation frame

      // Update each pipe
      pipes.forEach((pipe) => {
        if (pipe.update(gridBounds, setLocationOccupied, isLocationOccupied)) {
          pipesUpdated = true;
        }
      });

      // Check if pipes haven't grown in over 3 seconds, if so reset the scene
      if (!pipesUpdated) {
        idleTime += 1 / 60;
        if (idleTime > 3) resetScene();
      } else {
        idleTime = 0;
      }

      // Render and update controls
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate(); // Start the animation loop
  }, []);

  return (
    <>
      <Head>
        <title>Lucas Miller - 3D Pipes</title>
        <meta name="description" content="3D Pipes" />
      </Head>
      <div ref={containerRef} style={{ width: "100vw", height: "100vh" }} />
    </>
  );
};

export default PipesPage;
