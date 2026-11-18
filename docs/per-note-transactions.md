# Transações por nota

A proposta permite que operações de notas diferentes avancem em paralelo no adaptador em memória.
Operações da mesma nota continuam em ordem. Chamadas sem `noteId` compartilham uma fila própria.

O comportamento público do simulador e da API continua o mesmo: revisão condicional, nota e recibo
atômicos, recibos históricos e `opId` de escopo global. O mesmo `opId` com conteúdo diferente deve
produzir `id_reused`, inclusive quando muda o `noteId`. Não há autenticação nem mudança no protocolo.

Revise o diff e decida se a proposta pode ser integrada. Sustente sua conclusão com uma sequência
concreta, indique a evidência que falta e priorize a correção, se necessária.
