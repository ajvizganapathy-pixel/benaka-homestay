<?php
/*
 * Guest reviews: the database. PDO with REAL prepared statements (emulation
 * off), exceptions on, strict SQL mode, UTC session time zone. Every query in
 * review-api takes its values as bound parameters; nothing is built by
 * concatenating input into SQL.
 */
declare(strict_types=1);
if (!defined('BENAKA_REVIEWS')) { http_response_code(404); exit; }

function gr_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $pdo = new PDO((string)gr_cfg('DB_DSN', ''), (string)gr_cfg('DB_USER', ''), (string)gr_cfg('DB_PASS', ''), [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ]);
    $pdo->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

/** Run $fn inside a transaction; roll back on any exception and rethrow. */
function gr_tx(PDO $db, callable $fn) {
    $db->beginTransaction();
    try {
        $r = $fn($db);
        $db->commit();
        return $r;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}
