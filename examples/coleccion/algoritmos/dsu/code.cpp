#include <numeric>
#include <utility>
#include <vector>
struct DSU {
    std::vector<int> parent, size;
    explicit DSU(int n) : parent(n), size(n, 1) {
        std::iota(parent.begin(), parent.end(), 0);
    }
    int find(int u) { return parent[u] == u ? u : parent[u] = find(parent[u]); }
    bool unite(int u, int v) {
        u = find(u); v = find(v);
        if (u == v) return false;
        if (size[u] < size[v]) std::swap(u, v);
        parent[v] = u; size[u] += size[v];
        return true;
    }
};
