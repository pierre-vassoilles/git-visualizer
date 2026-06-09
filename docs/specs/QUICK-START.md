# Phase 1 : Quick Start (2 min)

## 📍 Où chercher quoi

| Besoin | Fichier |
|--------|---------|
| Comprendre l'archi | `00-model.md` |
| Implémenter git init | `01-init.md` |
| Implémenter git add | `02-add.md` |
| Implémenter git status | `03-status.md` |
| Implémenter git commit | `04-commit.md` |
| Implémenter git log | `05-log.md` |
| Implémenter write/read | `06-virtual-fs.md` |
| Résumé des décisions | `PHASE1-SUMMARY.md` |
| Plan sprint par sprint | `ORCHESTRATOR-GUIDE.md` |
| Standards code/test | `CONVENTIONS.md` |

## 📋 En résumé

**5 commandes + 2 utilitaires = 61 critères d'acceptation**

```
git init           → 2 CA
git add            → 10 CA
git status         → 9 CA
git commit         → 10 CA
git log            → 10 CA
write/read         → 10 CA (utilitaires non-Git)
```

## 🎯 Points clés

- **Modèle** : En mémoire, zéro FS réel
- **Hash** : SHA-1 Git-exact, déterministe
- **Auteur** : "Unnamed <unnamed@example.com>" (constant)
- **Date** : Timestamp Unix +1 par commit
- **HEAD** : Toujours symbolique → refs/heads/main
- **Index** : Vidé après chaque commit

## 🚀 Démarrer

1. Lire `00-model.md` (architecture)
2. Lire `PHASE1-SUMMARY.md` (points clés)
3. Choisir une commande (01-init.md, 02-add.md, etc.)
4. Respecter `CONVENTIONS.md` (code/test)
5. Écrire tests Vitest (61 tests totaux)
6. Vérifier couverture ≥90%

## ✅ Critères de succès

- Tous les CA implémentés
- Tous les tests Vitest passants
- Couverture ≥90%
- Messages d'erreur = Git standard
- Zéro accès au vrai FS
- Déterminisme confirmé

## 📞 Questions ?

- **Spec ?** → Consulte le fichier concerné
- **Architecture ?** → `00-model.md` + `PHASE1-SUMMARY.md`
- **Code ?** → `CONVENTIONS.md`
- **Timeline ?** → `ORCHESTRATOR-GUIDE.md`

---

**Bonne chance !** 🚀
