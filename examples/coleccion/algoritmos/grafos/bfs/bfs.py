from collections import deque


def bfs(graph, source):
    distance = [-1] * len(graph)
    distance[source] = 0
    queue = deque([source])
    while queue:
        u = queue.popleft()
        for v in graph[u]:
            if distance[v] == -1:
                distance[v] = distance[u] + 1
                queue.append(v)
    return distance
