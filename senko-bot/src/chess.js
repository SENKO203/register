// ============================================================
//   محرك الشطرنج — أسماء عربية + كل قواعد الحركة
// ============================================================

const CHESS_PIECES = {
    'w': { 'p':'♙','r':'♖','n':'♘','b':'♗','q':'♕','k':'♔' },
    'b': { 'p':'♟','r':'♜','n':'♞','b':'♝','q':'♛','k':'♚' }
};

const PIECE_NAMES_AR = {
    'ملكة':'q','ملك':'k','رخ':'r','فيل':'b','حصان':'n','بيدق':'p',
    '♛':'q','♚':'k','♜':'r','♝':'b','♞':'n','♟':'p',
    '♕':'q','♔':'k','♖':'r','♗':'b','♘':'n','♙':'p'
};

const COL_MAP = { 'A':0,'B':1,'C':2,'D':3,'E':4,'F':5,'G':6,'H':7,
                  'a':0,'b':1,'c':2,'d':3,'e':4,'f':5,'g':6,'h':7 };

function isInBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getPieceMoves(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    const color = piece.c;
    const enemy = color === 'w' ? 'b' : 'w';
    const dir = color === 'w' ? -1 : 1;

    const slide = (dr, dc) => {
        let nr = r + dr, nc = c + dc;
        while (isInBounds(nr, nc)) {
            if (board[nr][nc]) {
                if (board[nr][nc].c === enemy) moves.push([nr, nc]);
                break;
            }
            moves.push([nr, nc]);
            nr += dr; nc += dc;
        }
    };

    switch (piece.t) {
        case 'p':
            if (isInBounds(r + dir, c) && !board[r + dir][c]) {
                moves.push([r + dir, c]);
                if ((color === 'w' && r === 6) || (color === 'b' && r === 1)) {
                    if (!board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
                }
            }
            [-1, 1].forEach(dc => {
                if (isInBounds(r + dir, c + dc) && board[r + dir][c + dc]?.c === enemy)
                    moves.push([r + dir, c + dc]);
            });
            break;
        case 'r':
            [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => slide(dr,dc));
            break;
        case 'n':
            [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => {
                const nr = r+dr, nc = c+dc;
                if (isInBounds(nr,nc) && board[nr][nc]?.c !== color) moves.push([nr,nc]);
            });
            break;
        case 'b':
            [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => slide(dr,dc));
            break;
        case 'q':
            [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => slide(dr,dc));
            break;
        case 'k':
            [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => {
                const nr = r+dr, nc = c+dc;
                if (isInBounds(nr,nc) && board[nr][nc]?.c !== color) moves.push([nr,nc]);
            });
            break;
    }
    return moves;
}

function findKing(board, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.t === 'k' && board[r][c]?.c === color) return [r, c];
    return null;
}

function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return true;
    const enemy = color === 'w' ? 'b' : 'w';
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.c === enemy)
                if (getPieceMoves(board, r, c).some(([mr,mc]) => mr === king[0] && mc === king[1]))
                    return true;
    return false;
}

function hasAnyLegalMove(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]?.c !== color) continue;
            for (const [mr, mc] of getPieceMoves(board, r, c)) {
                const copy = board.map(row => row.map(cell => cell ? {...cell} : null));
                copy[mr][mc] = copy[r][c];
                copy[r][c] = null;
                if (!isInCheck(copy, color)) return true;
            }
        }
    }
    return false;
}

module.exports = {
    CHESS_PIECES,
    PIECE_NAMES_AR,
    COL_MAP,
    isInBounds,
    getPieceMoves,
    findKing,
    isInCheck,
    hasAnyLegalMove,
};
