import re
import sys

file_path = r'd:\ABJEE NEW\Abjee-Travel-NextJs\client\src\screens\ChatPage.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';",
    "import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';"
)
content = content.replace(
    "import { adminAPI, subscriptionsAPI } from '@/lib/api';",
    "import { adminAPI, subscriptionsAPI, placesAPI } from '@/lib/api';\nimport { useDebounce } from '@/hooks/useDebounce';"
)

# 2. State replacements
state_old = """  const deferredSearchDestination = useDeferredValue(searchDestination);
  const normalizedSearchDestination = useMemo(
    () => deferredSearchDestination.trim().toLowerCase(),
    [deferredSearchDestination]
  );"""
state_new = """  const debouncedSearchDestination = useDebounce(searchDestination, 300);
  const normalizedSearchDestination = useMemo(
    () => debouncedSearchDestination.trim().toLowerCase(),
    [debouncedSearchDestination]
  );
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);"""
content = content.replace(state_old, state_new)

# 3. Handle Load More handler before the API call
# Let's just insert it after hasSearchQuery
load_more_func = """  const handleLoadMore = useCallback(() => {
    if (!searchLoading && searchHasMore) {
      setSearchPage(prev => prev + 1);
    }
  }, [searchLoading, searchHasMore]);
"""
content = content.replace("  const hasSearchQuery = normalizedSearchDestination.length > 0;\n", "  const hasSearchQuery = normalizedSearchDestination.length > 0;\n\n" + load_more_func)

# 4. Remove filteredPlaces and filteredPlacesForRender
filter_old = r"""  const filteredPlaces = useMemo\(\(\) => \{
    if \(!hasSearchQuery\) return \[\];
    return firestorePlaces\.filter\(\(p\) => \(
      p\.name\.toLowerCase\(\)\.includes\(normalizedSearchDestination\) \|\|
      \(p\.area \?\? ''\)\.toLowerCase\(\)\.includes\(normalizedSearchDestination\) \|\|
      p\.state\.toLowerCase\(\)\.includes\(normalizedSearchDestination\) \|\|
      p\.country\.toLowerCase\(\)\.includes\(normalizedSearchDestination\)
    \)\);
  \}, \[firestorePlaces, hasSearchQuery, normalizedSearchDestination\]\);

  const filteredPlacesForRender = useMemo\(\(\) => \{
    if \(isMobile\) \{
      return filteredPlaces\.slice\(0, 16\);
    \}
    return filteredPlaces;
  \}, \[filteredPlaces, isMobile\]\);"""
content = re.sub(filter_old, "", content)

# 5. Update the useEffect API call
api_old = r"""  // Fetch tourist places once when the explore section opens\.
  useEffect\(\(\) => \{
    if \(selectedCategory !== 'outdoors'\) return;
    let cancelled = false;

    const fetchPlaces = async \(\) => \{
      if \(!normalizedSearchDestination\) \{
        if \(!cancelled\) \{
          setFirestorePlaces\(\[\]\);
        \}
        return;
      \}

      try \{
        const response = await adminAPI\.getPlaces\(\{
          search: normalizedSearchDestination,
          page: 1,
          limit: 60,
        \}\);

        if \(cancelled\) return;

        const data = response\.data\?\.data \?\? response\.data \?\? \{\};
        const rows = Array\.isArray\(data\.rows\)
          \? data\.rows
          : Array\.isArray\(data\.results\)
            \? data\.results
            : \[\];

        const normalizedPlaces = rows
          \.map\(\(row: unknown\) => \{
            if \(!row \|\| typeof row !== 'object'\) return null;
            const raw = row as Record<string, unknown>;
            const id = typeof raw\.id === 'string' \? raw\.id : '';
            if \(!id\) return null;

            return \{
              id,
              name: String\(raw\.name \|\| ''\),
              area: String\(raw\.area \|\| ''\),
              city: String\(raw\.city \|\| raw\.area \|\| ''\),
              state: String\(raw\.state \|\| ''\),
              country: String\(raw\.country \|\| ''\),
              description: String\(raw\.description \|\| ''\),
              category: String\(raw\.category \|\| 'Other'\),
              isActive: raw\.isActive !== false,
              googleMapsUrl: String\(raw\.googleMapsUrl \|\| ''\),
              coverImage: String\(raw\.coverImage \|\| ''\),
              media: Array\.isArray\(raw\.media\) \? \(raw\.media as MediaItem\[\]\) : \[\],
              extraInfo: Array\.isArray\(raw\.extraInfo\) \? raw\.extraInfo : \[\],
              createdAt: raw\.createdAt,
              updatedAt: raw\.updatedAt,
            \} as TouristPlace;
          \}\)
          \.filter\(\(place: TouristPlace \| null\): place is TouristPlace => place !== null\);

        setFirestorePlaces\(normalizedPlaces\);
      \} catch \{
        if \(!cancelled\) \{
          setFirestorePlaces\(\[\]\);
        \}
      \}
    \};

    void fetchPlaces\(\);
    return \(\) => \{
      cancelled = true;
    \};
  \}, \[normalizedSearchDestination, selectedCategory\]\);"""

api_new = """  // Reset pagination when search changes
  useEffect(() => {
    setSearchPage(1);
    setSearchHasMore(false);
    setFirestorePlaces([]);
  }, [normalizedSearchDestination]);

  // Fetch tourist places once when the explore section opens.
  useEffect(() => {
    if (selectedCategory !== 'outdoors') return;
    let cancelled = false;

    const fetchPlaces = async () => {
      if (!normalizedSearchDestination) {
        if (!cancelled) {
          setFirestorePlaces([]);
          setSearchHasMore(false);
        }
        return;
      }

      setSearchLoading(true);
      try {
        const response = await placesAPI.searchPlaces({
          search: normalizedSearchDestination,
          page: searchPage,
          limit: 16,
        });

        if (cancelled) return;

        const data = response.data?.data ?? response.data ?? {};
        const rows = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.results)
            ? data.results
            : [];
            
        const hasMore = Boolean(data.hasMore);

        const normalizedPlaces = rows
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null;
            const raw = row as Record<string, unknown>;
            const id = typeof raw.id === 'string' ? raw.id : '';
            if (!id) return null;

            return {
              id,
              name: String(raw.name || ''),
              area: String(raw.area || ''),
              city: String(raw.city || raw.area || ''),
              state: String(raw.state || ''),
              country: String(raw.country || ''),
              description: String(raw.description || ''),
              category: String(raw.category || 'Other'),
              isActive: raw.isActive !== false,
              googleMapsUrl: String(raw.googleMapsUrl || ''),
              coverImage: String(raw.coverImage || ''),
              media: Array.isArray(raw.media) ? (raw.media as MediaItem[]) : [],
              extraInfo: Array.isArray(raw.extraInfo) ? raw.extraInfo : [],
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as TouristPlace;
          })
          .filter((place: TouristPlace | null): place is TouristPlace => place !== null);

        if (searchPage === 1) {
          setFirestorePlaces(normalizedPlaces);
        } else {
          setFirestorePlaces(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPlaces = normalizedPlaces.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPlaces];
          });
        }
        setSearchHasMore(hasMore);
      } catch {
        if (!cancelled) {
          if (searchPage === 1) setFirestorePlaces([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    void fetchPlaces();
    return () => {
      cancelled = true;
    };
  }, [normalizedSearchDestination, searchPage, selectedCategory]);"""

content = re.sub(api_old, api_new, content)

# 6. Render fixes
content = content.replace("if (filteredPlaces.length === 0) {", "if (firestorePlaces.length === 0 && !searchLoading) {")
content = content.replace("{filteredPlacesForRender.length} of {filteredPlaces.length} place{filteredPlaces.length !== 1 ? 's' : ''} for &ldquo;{deferredSearchDestination.trim()}&rdquo;", "{firestorePlaces.length} result{firestorePlaces.length !== 1 ? 's' : ''} for &ldquo;{debouncedSearchDestination.trim()}&rdquo;")
content = content.replace("filteredPlacesForRender.map((place, idx) =>", "firestorePlaces.map((place, idx) =>")

# 7. Add Load More button at the end of the grid
# Find the closing div of the grid
grid_close = """                        </div>
                      </motion.div>"""
grid_close_new = """                        </div>
                        
                        {/* Pagination Load More */}
                        {searchHasMore && (
                          <div className="flex justify-center mt-10 mb-6">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleLoadMore}
                              disabled={searchLoading}
                              className={`px-8 py-3 rounded-full font-semibold transition-all shadow-lg border backdrop-blur-md flex items-center gap-2 ${
                                searchLoading 
                                  ? 'bg-white/20 border-white/20 text-white/50 cursor-not-allowed' 
                                  : 'bg-white/10 hover:bg-white/20 border-white/30 text-white hover:shadow-white/10'
                              }`}
                            >
                              {searchLoading ? (
                                <>
                                  <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                'Load More Destinations'
                              )}
                            </motion.button>
                          </div>
                        )}
                        
                        {searchLoading && !searchHasMore && firestorePlaces.length === 0 && (
                          <div className="flex justify-center mt-12">
                            <div className="h-8 w-8 border-4 border-white/20 border-t-white rounded-full animate-spin shadow-lg" />
                          </div>
                        )}
                      </motion.div>"""
content = content.replace(grid_close, grid_close_new)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
