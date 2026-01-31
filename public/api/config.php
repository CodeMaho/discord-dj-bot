<?php
// API simple para guardar/leer la configuración del backend
// Este archivo va en IONOS junto con el frontend

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$configFile = __DIR__ . '/backend-url.json';

// GET: Obtener configuración
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($configFile)) {
        $config = json_decode(file_get_contents($configFile), true);
        echo json_encode($config);
    } else {
        echo json_encode(['backendUrl' => '']);
    }
    exit();
}

// POST: Guardar configuración
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (isset($input['backendUrl'])) {
        $config = ['backendUrl' => $input['backendUrl']];

        if (file_put_contents($configFile, json_encode($config, JSON_PRETTY_PRINT))) {
            echo json_encode(['success' => true, 'config' => $config]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo guardar la configuración']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'backendUrl requerido']);
    }
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Método no permitido']);
